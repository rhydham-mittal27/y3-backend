import mongoose from 'mongoose';
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

  const tutors = await User.find({ role: USER_ROLES.TUTOR, isActive: true }).select('_id name email');
  if (tutors.length > 0) {
    const subjectNames = Array.isArray(lead.subject)
      ? lead.subject.map((s: any) => (typeof s === 'object' && s.label ? s.label : String(s))).join(', ')
      : (typeof lead.subject === 'object' && (lead.subject as any).label ? (lead.subject as any).label : String(lead.subject));

    const title = `New class opportunity: ${lead.grade} - ${subjectNames}`;
    const message = `A new class lead has been announced. Timing: ${lead.timing}. Mode: ${lead.mode}.`;

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
  const { tutorUserId, page, limit, isActive, sortBy, sortOrder } = params;

  const query: any = {
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

  // Load tutor profile to apply OFFLINE area filtering and ONLINE subject filtering
  // TODO: Use tutorDoc when implementing filtering logic
  await Tutor.findOne({ user: tutorUserId }).select('subjects preferredLocations');

  // NOTE: Tutor-specific subject/location matching is disabled for now so that
  // all active announcements where the tutor has not already expressed interest
  // are visible in the Class Opportunities feed.

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

export const computeMatchPercentage = (cl: any, tutor: any): number => {
  if (!cl || !tutor) return 0;

  const normalize = (s: any) => String(s || '').trim().toLowerCase();

  // 1. Subject Match (40%)
  const leadSubjects: string[] = (Array.isArray(cl.subject) ? cl.subject : cl.subject ? [String(cl.subject)] : []).map(normalize).filter(Boolean);
  const tutorSubjects: string[] = (Array.isArray(tutor.subjects) ? tutor.subjects : []).map(normalize).filter(Boolean);
  const preferredSubjects: string[] = (Array.isArray(tutor.settings?.preferredSubjects) ? tutor.settings.preferredSubjects : []).map(normalize).filter(Boolean);
  const tutorAllSubjects = new Set<string>([...tutorSubjects, ...preferredSubjects]);

  const subjectApplicable = leadSubjects.length > 0;
  const matchingSubjects = leadSubjects.filter((s) => tutorAllSubjects.has(s));
  const subjectMatchScore = subjectApplicable ? matchingSubjects.length / leadSubjects.length : 0;

  // 2. Mode Match (20%)
  const leadMode = normalize(cl.mode);
  const tutorPreferredMode = normalize(tutor.preferredMode || tutor.settings?.teachingModePreference);
  const modeApplicable = !!(leadMode && tutorPreferredMode);

  let modeScore = 0;
  if (modeApplicable) {
    if (leadMode === tutorPreferredMode) {
      modeScore = 1;
    } else if (tutorPreferredMode === 'hybrid') {
      modeScore = 0.75;
    }
  }

  // 3. City Match (20%)
  const leadCity = normalize(cl.city);
  const tutorPreferredCities = (Array.isArray(tutor.preferredCities) ? tutor.preferredCities : []).map(normalize).filter(Boolean);
  const cityApplicable = !!(leadCity && tutorPreferredCities.length > 0);
  const cityMatch = cityApplicable && tutorPreferredCities.includes(leadCity);

  // 4. Area Match (20%)
  const leadArea = normalize(cl.area || cl.location);
  const tutorPreferredLocations = (Array.isArray(tutor.preferredLocations) ? tutor.preferredLocations : []).map(normalize).filter(Boolean);
  const areaApplicable = !!(leadArea && tutorPreferredLocations.length > 0);
  const areaMatch = areaApplicable && tutorPreferredLocations.some((loc: string) => !!loc && loc === leadArea);

  // Dynamic Weighting (Total 1.0)
  const weights = { subject: 0.4, mode: 0.2, city: 0.2, area: 0.2 };
  let totalWeight = 0;
  let weightedScore = 0;

  if (subjectApplicable) {
    totalWeight += weights.subject;
    weightedScore += subjectMatchScore * weights.subject;
  }
  if (modeApplicable) {
    totalWeight += weights.mode;
    weightedScore += modeScore * weights.mode;
  }
  if (cityApplicable) {
    totalWeight += weights.city;
    weightedScore += (cityMatch ? 1 : 0) * weights.city;
  }
  if (areaApplicable) {
    totalWeight += weights.area;
    weightedScore += (areaMatch ? 1 : 0) * weights.area;
  }

  if (totalWeight === 0) return 0;
  
  return Math.round((weightedScore / totalWeight) * 100);
};

const enrichTutorData = (tutors: any[], interestedTutorsRaw: any[], classLeadDoc?: any) => {
  const tutorMap = new Map<string, any>();
  tutors.forEach((t) => {
    const approvalRatio = t.demosTaken ? (t.demosApproved / t.demosTaken) * 100 : 0;
    const matchPercentage = classLeadDoc ? computeMatchPercentage(classLeadDoc, t) : 0;
    const key = String((t.user as any)?._id || t.user);
    tutorMap.set(key, {
      id: String(t._id),
      user: t.user,
      experienceHours: t.experienceHours,
      subjects: t.subjects,
      ratings: t.ratings,
      classesAssigned: t.classesAssigned,
      demosTaken: t.demosTaken,
      demosApproved: t.demosApproved,
      approvalRatio,
      verificationStatus: t.verificationStatus,
      interestCount: t.interestCount,
      teacherId: t.teacherId,
      matchPercentage
    });
  });

  return interestedTutorsRaw.map((ti) => {
    const key = String(((ti.tutor as any)?._id) || ti.tutor);
    const merged = tutorMap.get(key);
    return {
      ...(merged || {}),
      interestedAt: ti.interestedAt,
      notes: ti.notes,
    };
  });
};

export const getInterestedTutors = async (announcementId: string) => {
  const announcement = await Announcement.findById(announcementId)
    .populate({
      path: 'classLead',
      populate: {
        path: 'subject',
        select: '_id label value type',
        populate: { path: 'parent', populate: { path: 'parent' } }
      }
    })
    .populate({
      path: 'interestedTutors.tutor',
      select: 'name email phone role',
    });
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);

  const tutorUserIds = announcement.interestedTutors
    .map((ti) => {
      const t: any = ti.tutor as any;
      const id = t?._id ? String(t._id) : String(t);
      try { return new mongoose.Types.ObjectId(id); } catch { return null; }
    })
    .filter((x): x is mongoose.Types.ObjectId => !!x);

  const tutors = await Tutor.find({ user: { $in: tutorUserIds } })
    .populate('user', 'name email phone')
    .populate({
      path: 'subjects',
      populate: {
        path: 'parent',
        populate: {
          path: 'parent'
        }
      }
    });
  const enriched = enrichTutorData(tutors, announcement.interestedTutors, announcement.classLead);
  return enriched.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
};

export const getRecommendedTutorsForLead = async (classLeadId: string) => {
  const lead = await ClassLead.findById(classLeadId).populate({
    path: 'subject',
    populate: { path: 'parent', populate: { path: 'parent' } }
  });
  if (!lead) throw new ErrorResponse('Class lead not found', 404);

  const query: any = {
    verificationStatus: 'VERIFIED',
    isAvailable: true,
  };

  const tutors = await Tutor.find(query)
    .limit(50)
    .populate('user', 'name email phone')
    .populate({
      path: 'subjects',
      populate: {
        path: 'parent',
        populate: {
          path: 'parent'
        }
      }
    });

  // Exclude tutors who already expressed interest
  const announcement = await Announcement.findOne({ classLead: classLeadId });
  const interestedTutorUserIds = announcement ? announcement.interestedTutors.map((ti) => String(ti.tutor)) : [];

  const filteredTutors = tutors.filter(t => !interestedTutorUserIds.includes(String(t.user?._id || t.user)));

  // Enrich using the same helper logic
  const enriched = filteredTutors.map(t => {
    const approvalRatio = t.demosTaken ? (t.demosApproved / t.demosTaken) * 100 : 0;
    const matchPercentage = computeMatchPercentage(lead, t);
    
    return {
      id: String(t._id),
      user: t.user,
      experienceHours: t.experienceHours,
      subjects: t.subjects,
      ratings: t.ratings,
      classesAssigned: t.classesAssigned,
      demosTaken: t.demosTaken,
      demosApproved: t.demosApproved,
      approvalRatio,
      verificationStatus: t.verificationStatus,
      interestCount: t.interestCount,
      isRecommendation: true,
      teacherId: t.teacherId,
      matchPercentage
    };
  });

  // Sort by match percentage descending
  return enriched.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
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
