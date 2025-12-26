import mongoose from 'mongoose';
import Tutor from '../models/Tutor';
import User from '../models/User';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { DOCUMENT_TYPES, USER_ROLES, VERIFICATION_STATUS, MANAGER_ACTION_TYPE, TUTOR_TIER, FINAL_CLASS_STATUS, TEST_STATUS } from '../config/constants';
import cloudinary, { CLOUDINARY_FOLDER } from '../config/cloudinary';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import TutorFeedback from '../models/TutorFeedback';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import Test from '../models/Test';
import { createNotificationWithPreferences } from './notificationService';

export const createTutorProfile = async (
  userId: string,
  experienceHours: number,
  subjects: string[],
  qualifications?: string[],
  preferredMode?: string,
  preferredLocations?: string[]
) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);
  if (user.role !== USER_ROLES.TUTOR) throw new ErrorResponse('User is not a tutor', 400);

  const existing = await Tutor.findOne({ user: userId });
  if (existing) throw new ErrorResponse('Tutor profile already exists', 409);

  const tutor = await Tutor.create({
    user: new mongoose.Types.ObjectId(userId),
    experienceHours,
    subjects,
    qualifications,
    preferredMode,
    preferredLocations,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  });

  await tutor.populate([
    { path: 'user', select: 'name email role phone' },
    { path: 'verifiedBy', select: 'name email role phone' },
  ]);
  return tutor;
};

export const getAllTutors = async (
  page = 1,
  limit = 10,
  verificationStatus?: VERIFICATION_STATUS,
  isAvailable?: boolean,
  subjects?: string[],
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
) => {
  const query: any = {};
  if (verificationStatus) query.verificationStatus = verificationStatus;
  if (typeof isAvailable === 'boolean') query.isAvailable = isAvailable;
  if (subjects && subjects.length) query.subjects = { $in: subjects };

  const skip = (page - 1) * limit;
  const sort: any = {};
  if (sortBy) sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
  else sort.createdAt = -1;

  const [tutors, total] = await Promise.all([
    Tutor.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'user', select: 'name email phone role' },
        { path: 'verifiedBy', select: 'name email phone role' },
      ]),
    Tutor.countDocuments(query),
  ]);

  return { tutors, total, page, limit };
};

export const getTutorById = async (tutorIdOrTeacherId: string) => {
  let tutor = null as any;

  if (mongoose.isValidObjectId(tutorIdOrTeacherId)) {
    // First, try standard lookup by internal Tutor _id
    tutor = await Tutor.findById(tutorIdOrTeacherId).populate([
      { path: 'user', select: 'name email phone role' },
      { path: 'verifiedBy', select: 'name email phone role' },
    ]);

    // If not found, also allow treating the value as a User _id
    if (!tutor) {
      tutor = await Tutor.findOne({ user: new mongoose.Types.ObjectId(tutorIdOrTeacherId) }).populate([
        { path: 'user', select: 'name email phone role' },
        { path: 'verifiedBy', select: 'name email phone role' },
      ]);
    }
  }

  if (!tutor) {
    // Fallback: lookup by public teacherId (e.g. TMBPLxyz12)
    tutor = await Tutor.findOne({ teacherId: tutorIdOrTeacherId }).populate([
      { path: 'user', select: 'name email phone role' },
      { path: 'verifiedBy', select: 'name email phone role' },
    ]);
  }

  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  return tutor;
};

export const getTutorByUserId = async (userId: string) => {
  const tutor = await Tutor.findOne({ user: userId }).populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  const tutorUserId = new mongoose.Types.ObjectId(
    String(((tutor.user as any)?._id) || tutor.user)
  );

  // Compute total experience hours as: sum over all classes of
  // (number of attendance records for that class * classLead.classDurationHours).
  // This uses actual attendance, not just the completedSessions counter.

  // First, load all classes for this tutor (any status) with their classLead.
  const allTutorClasses = await FinalClass.find({
    $or: [
      { tutor: tutorUserId },
      { tutorUser: tutorUserId },
    ],
  })
    .select('classLead')
    .populate({ path: 'classLead', select: 'classDurationHours' });

  const classIdMap = new Map<string, any>();
  const classIds: mongoose.Types.ObjectId[] = [];
  for (const cls of allTutorClasses as any[]) {
    const id = cls._id as mongoose.Types.ObjectId;
    classIds.push(id);
    classIdMap.set(String(id), cls);
  }

  let totalClassHours = 0;

  if (classIds.length > 0) {
    // Aggregate attendance counts per finalClass for this tutor.
    const attendanceCounts = await Attendance.aggregate([
      {
        $match: {
          tutor: tutorUserId,
          finalClass: { $in: classIds },
        },
      },
      {
        $group: {
          _id: '$finalClass',
          count: { $sum: 1 },
        },
      },
    ]);

    for (const row of attendanceCounts as any[]) {
      const cls = classIdMap.get(String(row._id));
      if (!cls) continue;
      const duration = (cls.classLead as any)?.classDurationHours || 0;
      const count = row.count || 0;
      if (duration > 0 && count > 0) {
        totalClassHours += duration * count;
      }
    }
  }

  (tutor as any).experienceHours = totalClassHours;

  return tutor;
};

export const updateTutorProfile = async (
  tutorId: string,
  updateData: Partial<{
    experienceHours: number;
    subjects: string[];
    qualifications: string[];
    preferredMode: string;
    preferredLocations: string[];
    isAvailable: boolean;
  }>
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  Object.assign(tutor, updateData);
  await tutor.save();
  await tutor.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return tutor;
};

export const updateTutorSettings = async (
  tutorId: string,
  settingsData: Partial<{
    availabilityPreferences: {
      daysAvailable?: string[];
      timeSlots?: string[];
      maxClassesPerWeek?: number;
    };
    teachingModePreference?: string;
    preferredSubjects?: string[];
    preferredLocations?: string[];
    notificationSettings: {
      classAssignments?: boolean;
      demoRequests?: boolean;
      feedbackReceived?: boolean;
    };
  }>
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  const currentSettings: any = tutor.settings || {};
  tutor.settings = {
    ...currentSettings,
    ...settingsData,
    availabilityPreferences: {
      ...(currentSettings.availabilityPreferences || {}),
      ...(settingsData.availabilityPreferences || {}),
    },
    notificationSettings: {
      ...(currentSettings.notificationSettings || {}),
      ...(settingsData.notificationSettings || {}),
    },
  } as any;

  await tutor.save();
  await tutor.populate([{ path: 'user', select: 'name email phone role' }]);
  return tutor;
};

export const uploadDocument = async (
  tutorId: string,
  documentType: string,
  file: any
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) {
    console.error('[uploadDocument] Tutor not found', { tutorId });
    throw new ErrorResponse('Tutor not found', 404);
  }

  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    console.error('[uploadDocument] Invalid document type', { tutorId, documentType });
    throw new ErrorResponse('Invalid document type', 400);
  }

  // Upload buffer to Cloudinary
  const buffer: Buffer | undefined = file?.buffer;
  const originalname: string = file?.originalname || 'document';
  if (!buffer) {
    console.error('[uploadDocument] Invalid file upload - missing buffer', {
      tutorId,
      documentType,
      originalname,
      hasFile: !!file,
    });
    throw new ErrorResponse('Invalid file upload', 400);
  }

  let uploadResult: any;
  try {
    uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_FOLDER,
          resource_type: 'auto',
          filename_override: originalname,
          use_filename: true,
          unique_filename: true,
        },
        (error: any, result: any) => {
          if (error) return reject(error);
          return resolve(result);
        }
      );
      stream.end(buffer);
    });
  } catch (err: any) {
    console.error('[uploadDocument] Cloudinary upload failed', {
      tutorId,
      documentType,
      originalname,
      errorMessage: err?.message,
      rawError: err,
    });
    throw new ErrorResponse('Failed to upload document to storage', 500);
  }

  const doc = {
    documentType,
    documentUrl: uploadResult.secure_url,
    uploadedAt: new Date(),
    publicId: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
  } as any;
  try {
    const previousStatus = tutor.verificationStatus as VERIFICATION_STATUS;

    tutor.documents.push(doc);

    // If this is the first ever document and tutor was pending, move to UNDER_REVIEW
    if (tutor.documents.length === 1 && previousStatus === VERIFICATION_STATUS.PENDING) {
      tutor.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
    }

    // If verification was previously rejected, any new upload should trigger re-review
    if (previousStatus === VERIFICATION_STATUS.REJECTED) {
      tutor.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
      tutor.verifiedBy = undefined as any;
      tutor.verifiedAt = undefined;
    }

    await tutor.save();
  } catch (err: any) {
    console.error('[uploadDocument] Failed to save tutor with new document', {
      tutorId,
      documentType,
      errorMessage: err?.message,
    });
    throw new ErrorResponse('Failed to save tutor document', 500);
  }
  await tutor.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return tutor;
};

export const deleteDocument = async (tutorId: string, documentIndex: number) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  if (!Array.isArray(tutor.documents) || documentIndex < 0 || documentIndex >= tutor.documents.length) {
    throw new ErrorResponse('Invalid document index', 400);
  }

  const doc: any = tutor.documents[documentIndex];
  if (doc?.publicId) {
    try {
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: (doc.resourceType as any) || 'image' });
    } catch {}
  }

  tutor.documents.splice(documentIndex, 1);
  await tutor.save();
  await tutor.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return tutor;
};

export const updateVerificationStatus = async (
  tutorId: string,
  newStatus: VERIFICATION_STATUS,
  verificationNotes: string | undefined,
  verifiedBy: string
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  const current = tutor.verificationStatus as VERIFICATION_STATUS;
  const valid = (from: VERIFICATION_STATUS, to: VERIFICATION_STATUS) => {
    // Allow moving from PENDING -> UNDER_REVIEW (auto when first doc uploaded)
    if (from === VERIFICATION_STATUS.PENDING && to === VERIFICATION_STATUS.UNDER_REVIEW) return true;
    // Allow managers to directly approve or reject from PENDING as well (for older tutors or manual flows)
    if (from === VERIFICATION_STATUS.PENDING && (to === VERIFICATION_STATUS.VERIFIED || to === VERIFICATION_STATUS.REJECTED)) return true;
    // Normal flow: UNDER_REVIEW -> VERIFIED / REJECTED
    if (from === VERIFICATION_STATUS.UNDER_REVIEW && (to === VERIFICATION_STATUS.VERIFIED || to === VERIFICATION_STATUS.REJECTED)) return true;
    return false;
  };

  if (!valid(current, newStatus)) {
    throw new ErrorResponse(`Invalid status transition from ${current} to ${newStatus}`, 400);
  }

  tutor.verificationStatus = newStatus;
  tutor.verificationNotes = verificationNotes;

  if (newStatus === VERIFICATION_STATUS.VERIFIED || newStatus === VERIFICATION_STATUS.REJECTED) {
    tutor.verifiedBy = new mongoose.Types.ObjectId(verifiedBy) as any;
    tutor.verifiedAt = new Date();
    // When tutor is verified, mark all existing documents as verified at the same time
    if (newStatus === VERIFICATION_STATUS.VERIFIED && Array.isArray(tutor.documents)) {
      const now = tutor.verifiedAt || new Date();
      tutor.documents = tutor.documents.map((d: any) => {
        if (!d) return d;
        if (!d.verifiedAt) d.verifiedAt = now;
        return d;
      }) as any;
    }
  }

  await tutor.save();

  const titleMap: Record<VERIFICATION_STATUS, string> = {
    [VERIFICATION_STATUS.PENDING]: 'Verification Pending',
    [VERIFICATION_STATUS.UNDER_REVIEW]: 'Verification Under Review',
    [VERIFICATION_STATUS.VERIFIED]: 'Verification Approved',
    [VERIFICATION_STATUS.REJECTED]: 'Verification Rejected',
  };

  const message = newStatus === VERIFICATION_STATUS.REJECTED
    ? `Your verification was rejected. ${verificationNotes || ''}`
    : `Your verification status is now: ${newStatus}`;

  await createNotificationWithPreferences({
    recipient: tutor.user as any,
    type: 'VERIFICATION',
    title: titleMap[newStatus],
    message,
  } as any);

  await tutor.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);

  try {
    if (newStatus === VERIFICATION_STATUS.VERIFIED) {
      await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(verifiedBy) }, { $inc: { tutorsVerified: 1 } });
    }
    // TODO: Use verifiedByUser for logging/display purposes
    await User.findById(verifiedBy).select('name');
    await logManagerActivity(
      verifiedBy,
      MANAGER_ACTION_TYPE.VERIFY_TUTOR,
      `Verified tutor ${(tutor as any).user?.name || ''} - status: ${newStatus}`,
      { entityType: 'Tutor', entityId: String(tutor._id), entityName: (tutor as any).user?.name },
      { oldStatus: current, newStatus, verificationNotes }
    );
  } catch {}

  return tutor;
};

export const getTutorsByVerificationStatus = async (
  status: VERIFICATION_STATUS,
  page = 1,
  limit = 10
) => {
  const skip = (page - 1) * limit;
  const query = { verificationStatus: status } as any;
  const [tutors, total] = await Promise.all([
    Tutor.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate([
        { path: 'user', select: 'name email phone role' },
        { path: 'verifiedBy', select: 'name email phone role' },
      ]),
    Tutor.countDocuments(query),
  ]);

  return { tutors, total, page, limit };
};

export const getTutorsForVerification = async () => {
  const tutors = await Tutor.find({
    verificationStatus: VERIFICATION_STATUS.UNDER_REVIEW,
    documents: { $ne: [] },
  })
    .sort({ updatedAt: 1 })
    .populate([{ path: 'user', select: 'name email phone role' }]);

  return tutors;
};

export const deleteTutorProfile = async (tutorId: string) => {
  const tutor: any = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  if (tutor.classesAssigned && tutor.classesAssigned > 0) {
    throw new ErrorResponse('Cannot delete tutor with active classes', 400);
  }

  if (Array.isArray(tutor.documents)) {
    for (const d of tutor.documents as any[]) {
      if (d?.publicId) {
        try {
          await cloudinary.uploader.destroy(d.publicId, { resource_type: (d.resourceType as any) || 'image' });
        } catch {}
      }
    }
  }

  await Tutor.findByIdAndDelete(tutorId);
  return { success: true };
};

export const requestTierChange = async (
  params: { tutorId: string; newTier: string; reason?: string; requestedBy: string }
) => {
  const { tutorId, newTier, reason, requestedBy } = params;
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  const validTiers = Object.values(TUTOR_TIER);
  if (!validTiers.includes(newTier as TUTOR_TIER)) {
    throw new ErrorResponse('Invalid tier value', 400);
  }
  if ((tutor.tier as string) === newTier) {
    throw new ErrorResponse('Tutor already has this tier', 400);
  }

  tutor.pendingTierChange = {
    newTier: newTier as TUTOR_TIER,
    requestedAt: new Date(),
    requestedBy: new mongoose.Types.ObjectId(requestedBy),
    reason,
  } as any;

  await tutor.save();
  await tutor.populate([
    { path: 'user', select: 'name email' },
    { path: 'tierUpdatedBy', select: 'name email' },
    { path: 'pendingTierChange.requestedBy', select: 'name email' },
  ] as any);

  try {
    await Notification.create({
      user: null,
      type: 'TIER_CHANGE',
      title: 'Tutor tier change request',
      message: `Tier change requested for ${(tutor as any).user?.name} to ${newTier}`,
      metadata: { tutorId: String(tutor._id), newTier, reason },
      roles: [USER_ROLES.MANAGER, USER_ROLES.ADMIN],
    } as any);
  } catch {}

  return tutor;
};

export const approveTierChange = async (
  params: { tutorId: string; approve: boolean; approvedBy: string; notes?: string }
) => {
  const { tutorId, approve, approvedBy, notes } = params;
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  if (!tutor.pendingTierChange) throw new ErrorResponse('No pending tier change request', 400);

  const pending = tutor.pendingTierChange as any;
  if (approve) {
    tutor.tier = pending.newTier as any;
    tutor.tierUpdatedAt = new Date();
    tutor.tierUpdatedBy = new mongoose.Types.ObjectId(approvedBy) as any;
  }
  tutor.pendingTierChange = undefined as any;
  await tutor.save();

  await tutor.populate([
    { path: 'user', select: 'name email' },
    { path: 'tierUpdatedBy', select: 'name email' },
  ]);

  try {
    await Notification.create({
      user: tutor.user,
      type: 'TIER_CHANGE',
      title: approve ? 'Tier change approved' : 'Tier change rejected',
      message: approve
        ? `Your tier has been updated to ${tutor.tier}`
        : `Your tier change request was rejected${notes ? `: ${notes}` : ''}`,
    } as any);
  } catch {}

  return tutor;
};

export const submitTutorFeedback = async (params: {
  tutorId: string;
  finalClassId: string;
  submittedBy: string;
  submitterRole: 'PARENT' | 'STUDENT';
  month: string;
  ratings: {
    overallRating: number;
    teachingQuality: number;
    punctuality: number;
    communication: number;
    subjectKnowledge: number;
  };
  comments?: string;
  strengths?: string;
  improvements?: string;
  wouldRecommend: boolean;
}) => {
  const {
    tutorId,
    finalClassId,
    submittedBy,
    submitterRole,
    month,
    ratings,
    comments,
    strengths,
    improvements,
    wouldRecommend,
  } = params;

  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  const finalClass = await FinalClass.findById(finalClassId);
  if (!finalClass) throw new ErrorResponse('Class not found', 404);

  if (String((finalClass as any).tutor) !== String(tutor.user)) {
    // Depending on schema, tutor could be stored differently; allow either match by user or tutor ref
    const tutorMatches = String((finalClass as any).tutor) === String(tutor._id) || String((finalClass as any).tutorUser) === String(tutor.user);
    if (!tutorMatches) throw new ErrorResponse('Tutor is not assigned to this class', 400);
  }

  if (!/^\d{4}-\d{2}$/.test(month)) throw new ErrorResponse('Month must be in YYYY-MM format', 400);

  const existing = await TutorFeedback.findOne({
    tutor: new mongoose.Types.ObjectId(tutorId),
    finalClass: new mongoose.Types.ObjectId(finalClassId),
    month,
    submittedBy: new mongoose.Types.ObjectId(submittedBy),
  });
  if (existing) throw new ErrorResponse('Feedback already submitted for this month', 409);

  const feedback = await TutorFeedback.create({
    tutor: new mongoose.Types.ObjectId(tutorId),
    finalClass: new mongoose.Types.ObjectId(finalClassId),
    submittedBy: new mongoose.Types.ObjectId(submittedBy),
    submitterRole,
    month,
    overallRating: ratings.overallRating,
    teachingQuality: ratings.teachingQuality,
    punctuality: ratings.punctuality,
    communication: ratings.communication,
    subjectKnowledge: ratings.subjectKnowledge,
    comments,
    strengths,
    improvements,
    wouldRecommend,
  });

  // Update tutor rating average
  const newTotal = (tutor.totalRatings || 0) + 1;
  const newAvg = (((tutor.ratings || 0) * (tutor.totalRatings || 0)) + ratings.overallRating) / newTotal;
  tutor.totalRatings = newTotal;
  tutor.ratings = Number(newAvg.toFixed(2));
  await tutor.save();

  await (feedback as any).populate([
    { path: 'tutor', select: 'name email' },
    { path: 'finalClass', select: 'studentName subject grade' },
    { path: 'submittedBy', select: 'name email role' },
  ]);

  try {
    await Notification.create({
      user: tutor.user,
      type: 'FEEDBACK',
      title: 'New feedback received',
      message: `New feedback submitted for ${month}`,
    } as any);
  } catch {}

  return feedback;
};

export const getTutorFeedback = async (params: {
  tutorId: string;
  page?: number;
  limit?: number;
  month?: string;
  finalClassId?: string;
}) => {
  const { tutorId, page = 1, limit = 10, month, finalClassId } = params;
  const filter: any = { tutor: new mongoose.Types.ObjectId(tutorId) };
  if (month) filter.month = month;
  if (finalClassId) filter.finalClass = new mongoose.Types.ObjectId(finalClassId);
  const skip = (page - 1) * limit;

  const [feedback, total] = await Promise.all([
    TutorFeedback.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate([
        { path: 'tutor', select: 'name email' },
        { path: 'finalClass', select: 'studentName subject grade' },
        { path: 'submittedBy', select: 'name email role' },
      ]),
    TutorFeedback.countDocuments(filter),
  ]);

  return { feedback, total, page, limit };
};

export const getTutorPerformanceMetrics = async (params: { tutorId: string; coordinatorUserId?: string }) => {
  const { tutorId, coordinatorUserId } = params;
  let tutor = null as any;
  if (mongoose.isValidObjectId(tutorId)) {
    tutor = await Tutor.findById(tutorId).populate([{ path: 'user', select: 'name email' }]);
  }
  if (!tutor) {
    // Allow passing userId instead of tutorId
    tutor = await Tutor.findOne({ user: tutorId }).populate([{ path: 'user', select: 'name email' }]);
  }
  if (!tutor) {
    // Gracefully handle missing tutor: return empty metrics
    return {
      tutor: null,
      classesAssigned: 0,
      classesCompleted: 0,
      totalClassHours: 0,
      attendanceApprovalRate: 0,
      averageTestScore: 0,
      feedbackRatings: {
        overall: 0,
        teachingQuality: 0,
        punctuality: 0,
        communication: 0,
        subjectKnowledge: 0,
      },
      recommendationRate: 0,
      totalFeedback: 0,
    };
  }

  let classQuery: any = { status: FINAL_CLASS_STATUS.ACTIVE };
  // guessing field names: tutor or tutorUser
  classQuery.$or = [
    { tutor: new mongoose.Types.ObjectId(String(tutor._id)) },
    { tutorUser: tutor.user },
  ];
  if (coordinatorUserId) classQuery.coordinator = new mongoose.Types.ObjectId(coordinatorUserId);

  const classes = await FinalClass.find(classQuery).select('_id');
  if (coordinatorUserId && classes.length === 0) throw new ErrorResponse('Tutor not assigned to your classes', 403);

  // TODO: Use classIds when implementing class-specific logic
  // const classIds = classes.map((c) => c._id);

  // Compute total class hours across all final classes for this tutor (any status)
  const allTutorClasses = await FinalClass.find({
    $or: [
      { tutor: tutor.user },
      { tutorUser: tutor.user },
    ],
  })
    .select('completedSessions classLead')
    .populate({ path: 'classLead', select: 'classDurationHours' });

  let totalClassHours = 0;
  for (const cls of allTutorClasses as any[]) {
    const completed = cls.completedSessions || 0;
    const duration = (cls.classLead as any)?.classDurationHours || 0;
    if (completed > 0 && duration > 0) {
      totalClassHours += completed * duration;
    }
  }

  // Attendance approval rate
  const [totalAttendance, approvedAttendance] = await Promise.all([
    Attendance.countDocuments({ tutor: tutor.user }),
    Attendance.countDocuments({ tutor: tutor.user, status: { $in: ['COORDINATOR_APPROVED', 'PARENT_APPROVED'] } }),
  ]);
  const attendanceApprovalRate = totalAttendance > 0 ? Number(((approvedAttendance / totalAttendance) * 100).toFixed(2)) : 0;

  // Tests average score placeholder
  const tests = await Test.find({ tutor: tutor.user, status: TEST_STATUS.REPORT_SUBMITTED }).select('_id');
  const averageTestScore = tests.length ? 75 : 0; // placeholder

  // Feedback averages
  const agg = await TutorFeedback.aggregate([
    { $match: { tutor: new mongoose.Types.ObjectId(tutorId) } },
    {
      $group: {
        _id: '$tutor',
        total: { $sum: 1 },
        overall: { $avg: '$overallRating' },
        teachingQuality: { $avg: '$teachingQuality' },
        punctuality: { $avg: '$punctuality' },
        communication: { $avg: '$communication' },
        subjectKnowledge: { $avg: '$subjectKnowledge' },
        recommended: { $sum: { $cond: ['$wouldRecommend', 1, 0] } },
      },
    },
  ]);

  const feedback = agg[0] || { total: 0, overall: 0, teachingQuality: 0, punctuality: 0, communication: 0, subjectKnowledge: 0, recommended: 0 };
  const recommendationRate = feedback.total ? Number(((feedback.recommended / feedback.total) * 100).toFixed(2)) : 0;

  return {
    tutor,
    classesAssigned: tutor.classesAssigned,
    classesCompleted: tutor.classesCompleted,
    totalClassHours,
    attendanceApprovalRate,
    averageTestScore,
    feedbackRatings: {
      overall: Number((feedback.overall || 0).toFixed(2)),
      teachingQuality: Number((feedback.teachingQuality || 0).toFixed(2)),
      punctuality: Number((feedback.punctuality || 0).toFixed(2)),
      communication: Number((feedback.communication || 0).toFixed(2)),
      subjectKnowledge: Number((feedback.subjectKnowledge || 0).toFixed(2)),
    },
    recommendationRate,
    totalFeedback: feedback.total || 0,
  };
};

export const getTutorsByCoordinator = async (params: {
  coordinatorUserId: string;
  page?: number;
  limit?: number;
  tier?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { coordinatorUserId, page = 1, limit = 9, tier, sortBy, sortOrder = 'desc' } = params;
  const classes = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId), status: FINAL_CLASS_STATUS.ACTIVE })
    .select('tutor tutorUser')
    .lean();
  const tutorIds = Array.from(
    new Set(
      classes
        .map((c: any) => c.tutorUser || c.tutor)
        .filter(Boolean)
        .map((id: any) => String(id))
    )
  );
  if (tutorIds.length === 0) return { tutors: [], total: 0, page, limit };

  const skip = (page - 1) * limit;
  const query: any = { user: { $in: tutorIds.map((id) => new mongoose.Types.ObjectId(id)) } };
  if (tier) query.tier = tier;
  const sort: any = {};
  if (sortBy) sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
  else sort.createdAt = -1;

  const [tutors, total] = await Promise.all([
    Tutor.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'user', select: 'name email phone' },
        { path: 'verifiedBy', select: 'name email' },
      ]),
    Tutor.countDocuments(query),
  ]);

  // Attach lightweight metrics if needed (approvalRatio already virtual)
  const tutorsWithMetrics = tutors;

  return { tutors: tutorsWithMetrics as any, total, page, limit };
};
