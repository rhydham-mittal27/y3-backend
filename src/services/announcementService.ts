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
import { USER_ROLES, CLASS_LEAD_STATUS, MANAGER_ACTION_TYPE } from '../config/constants';
import { logManagerActivity } from './managerService';

export const createAnnouncement = async (classLeadId: string, postedBy: string) => {
  const lead = await ClassLead.findById(classLeadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  const existing = await Announcement.findOne({ classLead: classLeadId });
  if (existing) {
    throw new ErrorResponse('Announcement already exists for this class lead', 409);
  }

  // Optional rule: only NEW or ANNOUNCED
  if (![CLASS_LEAD_STATUS.NEW, CLASS_LEAD_STATUS.ANNOUNCED].includes(lead.status as any)) {
    throw new ErrorResponse('Lead is not eligible for announcement', 400);
  }

  const announcement = await Announcement.create({
    classLead: new mongoose.Types.ObjectId(classLeadId),
    postedBy: new mongoose.Types.ObjectId(postedBy),
    postedAt: new Date(),
  });

  if (lead.status === CLASS_LEAD_STATUS.NEW) {
    await ClassLead.findByIdAndUpdate(classLeadId, { $set: { status: CLASS_LEAD_STATUS.ANNOUNCED } });
  }

  const tutors = await User.find({ role: USER_ROLES.TUTOR, isActive: true }).select('_id name email');
  if (tutors.length > 0) {
    const title = `New class opportunity: ${lead.grade} - ${Array.isArray(lead.subject) ? lead.subject.join(', ') : lead.subject}`;
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
      .populate('classLead postedBy'),
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
      .populate('classLead postedBy'),
    Announcement.countDocuments(query),
  ]);

  return { announcements, total, page, limit };
};

export const getAnnouncementById = async (announcementId: string) => {
  const announcement = await Announcement.findById(announcementId).populate('classLead postedBy');
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);
  return announcement;
};

export const getAnnouncementByLeadId = async (classLeadId: string) => {
  const announcement = await Announcement.findOne({ classLead: classLeadId })
    .populate('classLead postedBy')
    .populate('interestedTutors.tutor', 'name email phone role');
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);
  return announcement;
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
    ).populate('classLead postedBy interestedTutors.tutor'),
    Tutor.findByIdAndUpdate(tutorDoc._id, { $inc: { interestCount: 1 } }, { new: true }),
  ]);

  return updatedAnnouncement;
};

export const getInterestedTutors = async (announcementId: string) => {
  const announcement = await Announcement.findById(announcementId).populate({
    path: 'interestedTutors.tutor',
    select: 'name email phone role',
  });
  if (!announcement) throw new ErrorResponse('Announcement not found', 404);

  // interestedTutors.tutor may be populated User docs or ObjectIds; normalize to ObjectId array
  const tutorUserIds = announcement.interestedTutors
    .map((ti) => {
      const t: any = ti.tutor as any;
      const id = t?._id ? String(t._id) : String(t);
      try { return new mongoose.Types.ObjectId(id); } catch { return null; }
    })
    .filter((x): x is mongoose.Types.ObjectId => !!x);

  const tutors = await Tutor.find({ user: { $in: tutorUserIds } }).populate('user', 'name email phone');

  const tutorMap = new Map<string, any>();
  tutors.forEach((t) => {
    const approvalRatio = t.demosTaken ? (t.demosApproved / t.demosTaken) * 100 : 0;
    const key = String((t.user as any)?._id || t.user);
    tutorMap.set(key, {
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
    });
  });

  const enriched = announcement.interestedTutors.map((ti) => {
    const key = String(((ti.tutor as any)?._id) || ti.tutor);
    const merged = tutorMap.get(key);
    return {
      ...(merged || {}),
      interestedAt: ti.interestedAt,
    };
  });

  return enriched;
};

export const deactivateAnnouncement = async (announcementId: string) => {
  const updated = await Announcement.findByIdAndUpdate(announcementId, { $set: { isActive: false } }, { new: true });
  if (!updated) throw new ErrorResponse('Announcement not found', 404);
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
  expressInterest,
  getInterestedTutors,
  deactivateAnnouncement,
  sendCoordinatorAnnouncement,
  getCoordinatorAnnouncements,
  getCoordinatorAnnouncementById,
  getCoordinatorAnnouncementStats,
};
