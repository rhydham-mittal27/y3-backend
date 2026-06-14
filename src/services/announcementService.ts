import mongoose from 'mongoose';
import admin from 'firebase-admin';
import Announcement from '../models/Announcement';
import ClassLead from '../models/ClassLead';
import Tutor from '../models/Tutor';
import User from '../models/User';
import Notification from '../models/Notification';
import CoordinatorAnnouncement from '../models/CoordinatorAnnouncement';
import FinalClass from '../models/FinalClass';
import Coordinator from '../models/Coordinator';
import ErrorResponse from '../utils/errorResponse';
import { USER_ROLES, CLASS_LEAD_STATUS, MANAGER_ACTION_TYPE, CHANGE_ACTION } from '../config/constants';
import { logManagerActivity } from './managerService';
import { logChange } from './changeService';

export const createAnnouncement = async (classLeadId: string, postedBy: string) => {
  const lead = await ClassLead.findById(classLeadId).populate({
    path: 'subject',
    populate: { path: 'parent', populate: { path: 'parent' } }
  });
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  // Optional rule: allow announcing NEW, already ANNOUNCED, or REJECTED (after demo rejection)
  if (![
    CLASS_LEAD_STATUS.NEW,
    CLASS_LEAD_STATUS.ANNOUNCED,
    CLASS_LEAD_STATUS.REJECTED,
  ].includes(lead.status as any)) {
    throw new ErrorResponse('Lead is not eligible for announcement', 400);
  }

  const existing = await Announcement.findOne({ classLead: classLeadId });
  if (existing) {
    // If the lead was rejected (e.g. after a failed demo), the old announcement
    // must be removed so a fresh announcement can be posted for the re-opened lead.
    if (lead.status === CLASS_LEAD_STATUS.REJECTED) {
      await logChange({
        collection: 'Announcement',
        documentId: String(existing._id),
        documentRef: (lead as any).studentName,
        action: CHANGE_ACTION.DELETE,
        before: {
          classLead: existing.classLead,
          postedAt: existing.postedAt,
          isActive: existing.isActive,
          interestedTutorsCount: existing.interestedTutors?.length ?? 0,
        },
        changedBy: postedBy,
        reason: 'Deleted stale announcement — lead reposted after rejection',
        relatedTo: { collection: 'ClassLead', documentId: String(classLeadId) },
      });
      await Announcement.findByIdAndDelete(existing._id);
    } else {
      throw new ErrorResponse('Announcement already exists for this class lead', 409);
    }
  }

  const announcement = await Announcement.create({
    classLead: new mongoose.Types.ObjectId(classLeadId),
    postedBy: new mongoose.Types.ObjectId(postedBy),
    postedAt: new Date(),
  });

  if (lead.status === CLASS_LEAD_STATUS.NEW || lead.status === CLASS_LEAD_STATUS.REJECTED) {
    await ClassLead.findByIdAndUpdate(classLeadId, { $set: { status: CLASS_LEAD_STATUS.ANNOUNCED } });
  }

  const tutors = await User.find({ role: USER_ROLES.TUTOR, isActive: true }).select('_id name email expoPushToken');
  if (tutors.length > 0) {
    const subjectNames = Array.isArray(lead.subject)
      ? lead.subject.map((s: any) => (typeof s === 'object' && s.label ? s.label : String(s))).join(', ')
      : (typeof lead.subject === 'object' && (lead.subject as any).label ? (lead.subject as any).label : String(lead.subject));

    const feesInfo = (() => {
      const l = lead as any;
      if (l.studentDetails?.length) {
        const fees = l.studentDetails.map((s: any) => s.tutorFees).filter((f: any) => typeof f === 'number');
        if (!fees.length) return null;
        const min = Math.min(...fees);
        const max = Math.max(...fees);
        return min === max ? `₹${min}/mo` : `₹${min}–${max}/mo`;
      }
      if (typeof l.tutorFees === 'number') return `₹${l.tutorFees}/mo`;
      return null;
    })();

    const locationParts = [(lead as any).area, (lead as any).city].filter(Boolean);
    const locationInfo = locationParts.length ? locationParts.join(', ') : null;

    const gradeStr = (lead as any).grade ? `${(lead as any).grade} ` : '';
    const isOffline = (lead as any).mode?.toUpperCase() === 'OFFLINE';
    const title = isOffline && locationInfo
      ? `🎉 ${gradeStr}student needs help with ${subjectNames} at ${locationInfo}!`
      : `🎉 Your Next Student is Waiting!`;
    const modeStr = (lead as any).mode
      ? ((lead as any).mode.charAt(0).toUpperCase() + (lead as any).mode.slice(1).toLowerCase())
      : 'Flexible';
    const feesLine = feesInfo ? `\n💰 Fees: ${feesInfo}` : '';
    const locationLine = isOffline && locationInfo ? `\n📍 Location: ${locationInfo}` : '';
    const message = `A ${gradeStr}student needs help with ${subjectNames}.\n\n📖 Subject: ${subjectNames}\n🌍 ${modeStr} Classes\n⏰ Available: ${(lead as any).timing}${locationLine}${feesLine}\n\n🔥 Apply now and start teaching today.`;

    await Notification.insertMany(
      tutors.map((t) => ({
        recipient: t._id,
        type: 'ANNOUNCEMENT',
        title,
        message,
        relatedAnnouncement: announcement._id,
        relatedClassLead: lead._id,
      }))
    );

    // Send FCM push notifications directly via firebase-admin
    const fcmTokens: string[] = tutors
      .map((t: any) => t.expoPushToken)
      .filter((tok: any): tok is string => typeof tok === 'string' && tok.length > 10);

    if (fcmTokens.length > 0) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(require('../../firebase-service-account.json')),
        });
      }

      const fcmMessage: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: { title, body: message },
        android: {
          priority: 'high',
          notification: { channelId: 'announcements', sound: 'default' },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              category: 'ANNOUNCEMENT_CATEGORY',
            },
          },
        },
        data: {
          type: 'ANNOUNCEMENT',
          announcementId: String(announcement._id),
          classLeadId: String(lead._id),
          deepLink: `yourshikshak://announcement/${announcement._id}`,
          expressInterestDeepLink: `yourshikshak://express-interest/${announcement._id}`,
        },
      };

      admin.messaging().sendEachForMulticast(fcmMessage)
        .then((res) => console.log(`[Push] sent: ${res.successCount} ok, ${res.failureCount} failed`))
        .catch((err) => console.error('[Push] FCM error:', err));
    }
  }

  const populated = await Announcement.findById(announcement._id)
    .populate('classLead')
    .populate('postedBy', 'name email role');

  try {
    await logManagerActivity(
      postedBy,
      MANAGER_ACTION_TYPE.POST_ANNOUNCEMENT,
      `Posted announcement for class lead ${(lead as any).studentName}`,
      { entityType: 'Announcement', entityId: String(announcement._id), entityName: (lead as any).studentName },
      { classLeadId, totalTutorsNotified: tutors.length }
    );
    await logChange({
      collection: 'Announcement',
      documentId: String(announcement._id),
      documentRef: (lead as any).studentName,
      action: CHANGE_ACTION.CREATE,
      after: {
        classLead: classLeadId,
        postedAt: announcement.postedAt,
        totalTutorsNotified: tutors.length,
        leadStatus: lead.status,
      },
      changedBy: postedBy,
      relatedTo: { collection: 'ClassLead', documentId: String(classLeadId) },
    });
  } catch {}

  return populated;
};

export const getAllAnnouncements = async (
  page: number,
  limit: number,
  isActive?: boolean,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
) => {
  const query: any = {};
  if (typeof isActive === 'boolean') query.isActive = isActive;
  const skip = (page - 1) * limit;
  const sort: any = {};
  const sortField = sortBy || 'postedAt';
  sort[sortField] = sortOrder === 'asc' ? 1 : -1;

  const [announcements, total] = await Promise.all([
    Announcement.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate({
        path: 'classLead',
        populate: {
          path: 'subject',
          select: '_id label value type',
          populate: { path: 'parent', populate: { path: 'parent' } }
        }
      })
      .populate('postedBy', 'name email role'),
    Announcement.countDocuments(query),
  ]);

  return { announcements, total, page, limit };
};

export const getTutorAvailableAnnouncements = async (params: {
  tutorUserId: string;
  page: number;
  limit: number;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { tutorUserId, page, limit, isActive } = params;

  const query: any = {
    classLead: { $ne: null },
    'interestedTutors.tutor': { $ne: new mongoose.Types.ObjectId(tutorUserId) },
  };
  if (typeof isActive === 'boolean') {
    query.isActive = isActive;
  }

  // Restrict to announcements posted in the current week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  // Assuming week starts on Sunday; adjust if you prefer Monday (0 = Sunday, 1 = Monday, ...)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  query.postedAt = { $gte: startOfWeek };

  // Exclude announcements whose classLead has already been converted to a FinalClass
  const finalClasses = await FinalClass.find({}).select('classLead');
  const convertedLeadIds = finalClasses
    .map((fc: any) => fc.classLead)
    .filter((id: any) => !!id);
  if (convertedLeadIds.length > 0) {
    query.classLead = { $nin: convertedLeadIds };
  }

  // Load tutor profile for match scoring
  const tutorDoc = await Tutor.findOne({ user: tutorUserId })
    .populate('user', 'name email phone gender')
    .populate({ path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } });

  const skip = (page - 1) * limit;
  // Always fetch by postedAt desc from DB; we re-sort by matchPercentage after scoring
  const myInterestQuery: any = {
    classLead: { $ne: null },
    'interestedTutors.tutor': new mongoose.Types.ObjectId(tutorUserId),
    postedAt: { $gte: startOfWeek },
  };

  const [rawAnnouncements, total, myInterestCount] = await Promise.all([
    Announcement.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ postedAt: -1 })
      .populate({
        path: 'classLead',
        populate: {
          path: 'subject',
          select: '_id label value type',
          populate: { path: 'parent', populate: { path: 'parent' } }
        }
      })
      .populate('postedBy', 'name email role'),
    Announcement.countDocuments(query),
    Announcement.countDocuments(myInterestQuery),
  ]);

  // Attach matchPercentage to each announcement and sort highest first
  const tutorUserGender = normalize((tutorDoc?.user as any)?.gender);
  const announcements = rawAnnouncements
    .map((ann: any) => {
      const matchPercentage = tutorDoc ? computeMatchPercentage(ann.classLead, tutorDoc, tutorUserGender) : 0;
      const plain = ann.toObject ? ann.toObject() : { ...ann };
      return { ...plain, matchPercentage };
    })
    .sort((a: any, b: any) => b.matchPercentage - a.matchPercentage);

  return { announcements, total, page, limit, myInterestCount };
};

export const getAnnouncementById = async (announcementId: string) => {
  const announcement = await Announcement.findById(announcementId)
    .populate({
      path: 'classLead',
      populate: {
        path: 'subject',
        select: '_id label value type',
        populate: { path: 'parent', populate: { path: 'parent' } }
      }
    })
    .populate('postedBy', 'name email role');
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);
  return announcement;
};

export const getAnnouncementByLeadId = async (classLeadId: string) => {
  const announcement = await Announcement.findOne({ classLead: classLeadId })
    .populate({
      path: 'classLead',
      populate: {
        path: 'subject',
        select: '_id label value type',
        populate: { path: 'parent', populate: { path: 'parent' } }
      }
    })
    .populate('postedBy', 'name email role')
    .populate('interestedTutors.tutor', 'name email phone role');
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);
  return announcement;
};

// Returns all announcements (all time) where this tutor expressed interest
export const getMyExpressedInterests = async (tutorUserId: string) => {
  const announcements = await Announcement.find({
    'interestedTutors.tutor': new mongoose.Types.ObjectId(tutorUserId),
  })
    .sort({ 'interestedTutors.interestedAt': -1 })
    .populate({
      path: 'classLead',
      populate: {
        path: 'subject',
        select: '_id label value type',
        populate: { path: 'parent', populate: { path: 'parent' } }
      }
    });

  const results = (announcements || []).map((ann: any) => {
    const myEntry = ann.interestedTutors?.find(
      (ti: any) => String(ti.tutor?._id || ti.tutor) === String(tutorUserId)
    );
    return {
      _id: ann._id,
      classLead: ann.classLead,
      isActive: ann.isActive,
      postedAt: ann.postedAt,
      interestedAt: myEntry?.interestedAt,
      notes: myEntry?.notes,
    };
  });

  return results;
};

export const expressInterest = async (announcementId: string, tutorUserId: string, notes?: string) => {
  const announcement = await Announcement.findById(announcementId);
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);

  const already = announcement.interestedTutors.some((ti) => ti.tutor.toString() === tutorUserId);
  if (already) throw new ErrorResponse('Already expressed interest', 400);

  const tutorDoc = await Tutor.findOne({ user: tutorUserId });
  if (!tutorDoc) throw new ErrorResponse('Tutor profile not found', 404);

  const [updatedAnnouncement] = await Promise.all([
    Announcement.findByIdAndUpdate(
      announcementId,
      {
        $addToSet: {
          interestedTutors: {
            tutor: new mongoose.Types.ObjectId(tutorUserId),
            interestedAt: new Date(),
            notes,
          },
        },
      },
      { new: true }
    ).populate({
      path: 'classLead',
      populate: {
        path: 'subject',
        select: '_id label value type',
        populate: { path: 'parent', populate: { path: 'parent' } }
      }
    }).populate('postedBy', 'name email role').populate('interestedTutors.tutor'),
    Tutor.findByIdAndUpdate(tutorDoc._id, { $inc: { interestCount: 1 } }, { new: true }),
  ]);

  return updatedAnnouncement;
};

// ─── Lead Match Scoring ──────────────────────────────────────────────────────
//
// Subject match is hierarchical (board + grade + subject as one unit).
// Each subject _id in the Option model is unique per board→grade→subject path,
// so matching by _id implies a full board+grade+subject match — binary 0 or 1.
//
// ONLINE  (100%):
//   Subject(board+grade+subject) 90% | Timing 10%
//
// OFFLINE (100%):
//   Area 60% | Subject(board+grade+subject) 35% | Timing 5%
//
// Hard filters (tutor excluded before scoring):
//   - isAvailable = false
//   - verificationStatus ≠ VERIFIED
//   - Subject overlap = 0
//   - OFFLINE/HYBRID: tutor preferredCities must include lead city
//   - preferredTutorGender is M/F and tutor gender doesn't match
//
// 100% score → "Recommend for you" push notification sent to tutor
// ─────────────────────────────────────────────────────────────────────────────

const normalize = (s: any) => String(s || '').trim().toLowerCase();

const subjectIds = (arr: any[]): string[] =>
  arr.map((s: any) => normalize(s?._id ?? s)).filter(Boolean);

const timingOverlapScore = (leadTiming: string, tutorSlots: string[]): number => {
  if (!leadTiming || !tutorSlots.length) return 0;
  const lead = normalize(leadTiming);
  for (const slot of tutorSlots) {
    if (normalize(slot) === lead) return 1;
  }
  const hourOf = (t: string) => { const m = t.match(/(\d{1,2})/); return m ? parseInt(m[1], 10) : -1; };
  const lh = hourOf(lead);
  for (const slot of tutorSlots) {
    if (lh >= 0 && Math.abs(hourOf(normalize(slot)) - lh) <= 1) return 0.5;
  }
  return 0;
};

export const computeMatchPercentage = (cl: any, tutor: any, _tutorUserGender?: string): number => {
  if (!cl || !tutor) return 0;

  const isOffline = ['offline', 'hybrid'].includes(normalize(cl.mode));

  // ── Subject (full hierarchy match: board+grade+subject via _id) ───────────
  // Binary: all lead subjects must match tutor subjects by _id (0 or 1 per subject)
  const leadSubjectIds = subjectIds(Array.isArray(cl.subject) ? cl.subject : cl.subject ? [cl.subject] : []);
  const tutorSubjectIds = new Set<string>([
    ...subjectIds(Array.isArray(tutor.subjects) ? tutor.subjects : []),
    ...subjectIds(Array.isArray(tutor.settings?.preferredSubjects) ? tutor.settings.preferredSubjects : []),
  ]);
  // Full match only — partial overlap still scores proportionally but each subject
  // is either a full board+grade+subject match (1) or not (0)
  const matchedCount = leadSubjectIds.filter(id => tutorSubjectIds.has(id)).length;
  const subjectScore = leadSubjectIds.length > 0 ? matchedCount / leadSubjectIds.length : 0;

  // ── Timing ────────────────────────────────────────────────────────────────
  const tutorSlots: string[] = Array.isArray(tutor.settings?.availabilityPreferences?.timeSlots)
    ? tutor.settings.availabilityPreferences.timeSlots : [];
  const timingScore = timingOverlapScore(cl.timing, tutorSlots);

  if (!isOffline) {
    // ONLINE: subject(board+grade+subject) 90 | timing 10
    return Math.round(subjectScore * 90 + timingScore * 10);
  }

  // ── Area (offline soft filter) ────────────────────────────────────────────
  const leadArea = normalize(cl.area || cl.location);
  const tutorAreas = (Array.isArray(tutor.preferredLocations) ? tutor.preferredLocations : []).map(normalize);
  const areaScore = leadArea && tutorAreas.length ? (tutorAreas.includes(leadArea) ? 1 : 0) : 0;

  // OFFLINE: area 60 | subject(board+grade+subject) 35 | timing 5
  return Math.round(areaScore * 60 + subjectScore * 35 + timingScore * 5);
};

// Returns true if tutor passes ALL hard filters for a given lead
const passeHardFilters = (tutor: any, lead: any, tutorUserGender?: string): boolean => {
  // Already guaranteed VERIFIED + isAvailable at DB query level — guard here as well
  if (!tutor.isAvailable) return false;
  if (tutor.verificationStatus !== 'VERIFIED') return false;

  // Subject overlap must be > 0
  const leadSubjectIds = subjectIds(Array.isArray(lead.subject) ? lead.subject : lead.subject ? [lead.subject] : []);
  const tutorSubjectIds = new Set<string>([
    ...subjectIds(Array.isArray(tutor.subjects) ? tutor.subjects : []),
    ...subjectIds(Array.isArray(tutor.settings?.preferredSubjects) ? tutor.settings.preferredSubjects : []),
  ]);
  if (leadSubjectIds.length > 0 && !leadSubjectIds.some(id => tutorSubjectIds.has(id))) return false;

  // OFFLINE/HYBRID: tutor must have lead city in preferredCities
  const isOffline = ['offline', 'hybrid'].includes(normalize(lead.mode));
  if (isOffline) {
    const leadCity = normalize(lead.city);
    if (leadCity) {
      const tutorCities = (Array.isArray(tutor.preferredCities) ? tutor.preferredCities : []).map(normalize);
      if (tutorCities.length > 0 && !tutorCities.includes(leadCity)) return false;
    }
  }

  // Gender preference hard filter
  const prefGender = normalize(lead.preferredTutorGender);
  if (prefGender && prefGender !== 'any') {
    const tGender = normalize(tutorUserGender);
    if (tGender && tGender !== prefGender) return false;
  }

  return true;
};

const sendPerfectMatchNotification = async (tutor: any, lead: any, announcementId: string) => {
  try {
    const userDoc = await User.findById(tutor.user?._id || tutor.user).select('expoPushToken _id');
    if (!userDoc) return;

    await Notification.create({
      recipient: userDoc._id,
      type: 'ANNOUNCEMENT',
      title: '⭐ 100% Match with your profile!',
      message: `A new class matches all your preferences. Apply now before someone else does!`,
      relatedAnnouncement: new mongoose.Types.ObjectId(announcementId),
      relatedClassLead: lead._id,
    });

    const token = (userDoc as any).expoPushToken;
    if (typeof token === 'string' && token.length > 10) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(require('../../firebase-service-account.json')),
        });
      }
      admin.messaging().send({
        token,
        notification: {
          title: '⭐ 100% Match with your profile!',
          body: 'A new class matches all your preferences. Apply now!',
        },
        android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
        data: {
          type: 'ANNOUNCEMENT',
          announcementId: String(announcementId),
          classLeadId: String(lead._id),
          deepLink: `yourshikshak://announcement/${announcementId}`,
        },
      }).catch(err => console.error('[PerfectMatch] FCM error:', err));
    }
  } catch (err) {
    console.error('[PerfectMatch] Notification failed:', err);
  }
};

const buildTutorResult = (t: any, lead: any, extra: Record<string, any> = {}) => {
  const tutorUserGender = normalize((t.user as any)?.gender);
  const matchPercentage = computeMatchPercentage(lead, t, tutorUserGender);
  return {
    id: String(t._id),
    user: t.user,
    teacherId: t.teacherId,
    experienceHours: t.experienceHours,
    subjects: t.subjects,
    ratings: t.ratings,
    classesAssigned: t.classesAssigned,
    demosTaken: t.demosTaken,
    demosApproved: t.demosApproved,
    approvalRatio: t.demosTaken ? Math.round((t.demosApproved / t.demosTaken) * 100) : 0,
    verificationStatus: t.verificationStatus,
    interestCount: t.interestCount,
    matchPercentage,
    ...extra,
  };
};

export const getInterestedTutors = async (announcementId: string) => {
  const announcement = await Announcement.findById(announcementId)
    .populate({
      path: 'classLead',
      populate: { path: 'subject', select: '_id label value type', populate: { path: 'parent', populate: { path: 'parent' } } }
    })
    .populate({ path: 'interestedTutors.tutor', select: 'name email phone role gender' });
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);

  const tutorUserIds = announcement.interestedTutors
    .map((ti) => { const t: any = ti.tutor; const id = t?._id ? String(t._id) : String(t); try { return new mongoose.Types.ObjectId(id); } catch { return null; } })
    .filter((x): x is mongoose.Types.ObjectId => !!x);

  const tutors = await Tutor.find({ user: { $in: tutorUserIds } })
    .populate('user', 'name email phone gender')
    .populate({ path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } });

  const tutorMap = new Map<string, any>();
  tutors.forEach(t => tutorMap.set(String((t.user as any)?._id || t.user), t));

  const enriched = announcement.interestedTutors.map((ti) => {
    const key = String((ti.tutor as any)?._id || ti.tutor);
    const t = tutorMap.get(key);
    if (!t) return { matchPercentage: 0, interestedAt: ti.interestedAt, notes: ti.notes };
    return {
      ...buildTutorResult(t, announcement.classLead),
      interestedAt: ti.interestedAt,
      notes: ti.notes,
    };
  });

  return enriched.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
};

export const getRecommendedTutorsForLead = async (classLeadId: string) => {
  const lead = await ClassLead.findById(classLeadId).populate({
    path: 'subject',
    populate: { path: 'parent', populate: { path: 'parent' } }
  });
  if (!lead) throw new ErrorResponse('Class lead not found', 404);

  const announcement = await Announcement.findOne({ classLead: classLeadId });
  const interestedUserIds = new Set((announcement?.interestedTutors ?? []).map(ti => String(ti.tutor)));

  const tutors = await Tutor.find({ verificationStatus: 'VERIFIED', isAvailable: true })
    .limit(200)
    .populate('user', 'name email phone gender')
    .populate({ path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } });

  const results: any[] = [];

  for (const t of tutors) {
    // Skip tutors who already expressed interest
    if (interestedUserIds.has(String(t.user?._id || t.user))) continue;

    const tutorUserGender = normalize((t.user as any)?.gender);
    if (!passeHardFilters(t, lead, tutorUserGender)) continue;

    const result = buildTutorResult(t, lead, { isRecommendation: true });
    results.push(result);

    // Send perfect match notification (fire-and-forget)
    if (result.matchPercentage === 100 && announcement) {
      sendPerfectMatchNotification(t, lead, String(announcement._id));
    }
  }

  return results.sort((a, b) => b.matchPercentage - a.matchPercentage);
};

export const deactivateAnnouncement = async (announcementId: string, deactivatedBy?: string) => {
  const prev = await Announcement.findById(announcementId);
  if (!prev) throw new ErrorResponse('Announcement not found', 404);
  const updated = await Announcement.findByIdAndUpdate(announcementId, { $set: { isActive: false } }, { new: true });
  if (deactivatedBy) {
    await logChange({
      collection: 'Announcement',
      documentId: announcementId,
      action: CHANGE_ACTION.UPDATE,
      before: { isActive: prev.isActive },
      after: { isActive: false },
      changedBy: deactivatedBy,
    });
  }
  return updated;
};

// Coordinator announcements
export const sendCoordinatorAnnouncement = async (params: {
  coordinatorUserId: string;
  subject: string;
  message: string;
  recipientType: string;
  targetClassId?: string;
  targetTutorId?: string;
}) => {
  const { coordinatorUserId, subject, message, recipientType, targetClassId, targetTutorId } = params;

  const coordinatorDoc = await Coordinator.findOne({ user: coordinatorUserId });
  if (!coordinatorDoc) throw new ErrorResponse('Coordinator not found', 404);

  const recipients: mongoose.Types.ObjectId[] = [];

  const pushUnique = (id?: any) => {
    if (!id) return;
    const str = String(id);
    if (!recipients.find((r) => String(r) === str)) recipients.push(new mongoose.Types.ObjectId(str));
  };

  if (recipientType === 'SPECIFIC_CLASS') {
    if (!targetClassId) throw new ErrorResponse('Class ID is required for SPECIFIC_CLASS', 400);
    const cls = await FinalClass.findById(targetClassId).select('tutor coordinator parent');
    if (!cls) throw new ErrorResponse('Class not found', 404);
    if (String(cls.coordinator) !== String(coordinatorUserId)) throw new ErrorResponse('Not authorized for this class', 403);
    pushUnique((cls as any).tutor);
    pushUnique((cls as any).parent);
  } else if (recipientType === 'ALL_CLASSES') {
    const classes = await FinalClass.find({ coordinator: coordinatorUserId, status: 'ACTIVE' }).select('tutor parent');
    classes.forEach((c: any) => {
      pushUnique(c.tutor);
      pushUnique(c.parent);
    });
  } else if (recipientType === 'SPECIFIC_TUTOR') {
    if (!targetTutorId) throw new ErrorResponse('Tutor ID is required for SPECIFIC_TUTOR', 400);
    const hasAssignment = await FinalClass.exists({ coordinator: coordinatorUserId, tutor: targetTutorId });
    if (!hasAssignment) throw new ErrorResponse('Tutor not assigned to your classes', 400);
    pushUnique(targetTutorId);
  } else if (recipientType === 'ALL_TUTORS') {
    const classes = await FinalClass.find({ coordinator: coordinatorUserId }).select('tutor');
    classes.forEach((c: any) => pushUnique(c.tutor));
  } else if (recipientType === 'STUDENTS_PARENTS') {
    const classes = await FinalClass.find({ coordinator: coordinatorUserId }).select('parent');
    classes.forEach((c: any) => pushUnique(c.parent));
  }

  if (recipients.length === 0) throw new ErrorResponse('No recipients found for the selected criteria', 400);

  const announcement = await CoordinatorAnnouncement.create({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    subject,
    message,
    recipientType,
    targetClass: targetClassId ? new mongoose.Types.ObjectId(targetClassId) : undefined,
    targetTutor: targetTutorId ? new mongoose.Types.ObjectId(targetTutorId) : undefined,
    recipients,
    recipientCount: recipients.length,
    sentAt: new Date(),
  });

  await Notification.insertMany(
    recipients.map((recipientId) => ({
      recipient: recipientId,
      type: 'GENERAL',
      title: subject,
      message,
      relatedAnnouncement: null,
    }))
  );

  const populated = await CoordinatorAnnouncement.findById(announcement._id)
    .populate('coordinator', 'name email')
    .populate('targetClass', 'studentName subject grade')
    .populate('targetTutor', 'name email');

  return populated;
};

export const getCoordinatorAnnouncements = async (params: {
  coordinatorUserId: string;
  page: number;
  limit: number;
  recipientType?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { coordinatorUserId, page, limit, recipientType, fromDate, toDate, sortBy = 'sentAt', sortOrder = 'desc' } = params;
  const query: any = { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) };
  if (recipientType) query.recipientType = recipientType;
  if (fromDate || toDate) {
    query.sentAt = {} as any;
    if (fromDate) query.sentAt.$gte = fromDate;
    if (toDate) query.sentAt.$lte = toDate;
  }
  const skip = (page - 1) * limit;
  const sort: any = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const [announcements, total] = await Promise.all([
    CoordinatorAnnouncement.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate('coordinator', 'name email')
      .populate('targetClass', 'studentName subject grade')
      .populate('targetTutor', 'name email'),
    CoordinatorAnnouncement.countDocuments(query),
  ]);

  return { announcements, total, page, limit };
};

export const getCoordinatorAnnouncementById = async (announcementId: string, coordinatorUserId: string) => {
  const ann = await CoordinatorAnnouncement.findById(announcementId)
    .populate('coordinator', 'name email')
    .populate('targetClass', 'studentName subject grade')
    .populate('targetTutor', 'name email');
  if (!ann) throw new ErrorResponse('Announcement not found', 404);
  if (String((ann as any).coordinator._id || (ann as any).coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to view this announcement', 403);
  }
  return ann;
};

export const getCoordinatorAnnouncementStats = async (coordinatorUserId: string) => {
  const breakdown = await CoordinatorAnnouncement.aggregate([
    { $match: { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $group: { _id: '$recipientType', count: { $sum: 1 }, totalRecipients: { $sum: '$recipientCount' } } },
  ]);

  const totals = await CoordinatorAnnouncement.aggregate([
    { $match: { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $group: { _id: null, totalAnnouncements: { $sum: 1 }, totalRecipients: { $sum: '$recipientCount' } } },
  ]);

  const totalAnnouncements = totals[0]?.totalAnnouncements || 0;
  const totalRecipients = totals[0]?.totalRecipients || 0;

  return { totalAnnouncements, totalRecipients, breakdown };
};

export default {
  createAnnouncement,
  getAllAnnouncements,
  getTutorAvailableAnnouncements,
  getAnnouncementById,
  getAnnouncementByLeadId,
  getMyExpressedInterests,
  expressInterest,
  getInterestedTutors,
  deactivateAnnouncement,
  sendCoordinatorAnnouncement,
  getCoordinatorAnnouncements,
  getCoordinatorAnnouncementById,
  getCoordinatorAnnouncementStats,
};
