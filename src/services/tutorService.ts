import mongoose from 'mongoose';
import Tutor from '../models/Tutor';
import User from '../models/User';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { DOCUMENT_TYPES, USER_ROLES, VERIFICATION_STATUS, MANAGER_ACTION_TYPE, TUTOR_TIER, FINAL_CLASS_STATUS, TEST_STATUS, ATTENDANCE_STATUS } from '../config/constants';
import { uploadFileToS3Structured, deleteFileFromS3, resolveS3DocumentUrl } from '../services/s3Service';
import { S3_CONFIG } from '../config/s3';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import TutorFeedback from '../models/TutorFeedback';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import Test from '../models/Test';
import Payment from '../models/Payment';
import DemoHistory from '../models/DemoHistory';
import AttendanceSheet from '../models/AttendanceSheet';
import { createNotificationWithPreferences } from './notificationService';
import { PAYMENT_STATUS, PAYMENT_TYPE, DEMO_STATUS, VERIFICATION_FEE_AMOUNT, VERIFICATION_FEE_DEDUCT_AMOUNT } from '../config/constants';

const withResolvedTutorDocumentUrls = async (tutor: any) => {
  if (!tutor) return tutor;
  
  // Create a deep enough copy to avoid mutating the original if it's a plain object
  // If it's a Mongoose document, toObject() gives us a plain object
  const copy: any = typeof tutor.toObject === 'function' ? tutor.toObject() : JSON.parse(JSON.stringify(tutor));
  
  const docs = Array.isArray(copy.documents) ? copy.documents : [];
  console.log(`[withResolvedTutorDocumentUrls] Tutor: ${copy.teacherId || copy._id}, Docs count: ${docs.length}`);
  
  if (docs.length === 0) return copy;

  copy.documents = await Promise.all(
    docs.map(async (d: any, idx: number) => {
      // Use s3Key if available, otherwise fallback to documentUrl
      const rawKey = String(d?.s3Key || d?.documentUrl || '').trim();
      const resolved = await resolveS3DocumentUrl(rawKey);
      
      if (!resolved.startsWith('http') || resolved.includes('api.yourshikshak.in')) {
         console.warn(`[withResolvedTutorDocumentUrls] Resolution failed for Doc ${idx}: Input=${rawKey} -> Output=${resolved}`);
      }
      
      return {
        ...(d || {}),
        documentUrl: resolved,
      };
    })
  );
  return copy;
};

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
    { path: 'user', select: 'name email role phone gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email role phone' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
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
  sortOrder: 'asc' | 'desc' = 'desc',
  search?: string,
  teacherId?: string,
  name?: string,
  email?: string,
  phone?: string,
  preferredMode?: string,
  verifiedBy?: string,
  city?: string,
  area?: string,
  grade?: string,
  board?: string
) => {
  const query: any = {};
  if (verificationStatus) query.verificationStatus = verificationStatus;
  if (typeof isAvailable === 'boolean') query.isAvailable = isAvailable;
  if (subjects && subjects.length) query.subjects = { $in: subjects };
  if (teacherId) query.teacherId = { $regex: teacherId, $options: 'i' };
  if (preferredMode) query.preferredMode = preferredMode;
  if (area) query.preferredLocations = { $regex: area, $options: 'i' };
  if (grade) query.preferredGrades = { $regex: grade, $options: 'i' };
  if (board) query.preferredBoards = { $regex: board, $options: 'i' };
  if (verifiedBy && mongoose.isValidObjectId(verifiedBy)) query.verifiedBy = new mongoose.Types.ObjectId(verifiedBy);

  // For name, email, phone we need to filter based on the populated user field
  // This is best done with an aggregation or by finding userIds first
  let userQuery: any = {};
  if (name) userQuery.name = { $regex: name, $options: 'i' };
  if (email) userQuery.email = { $regex: email, $options: 'i' };
  if (phone) userQuery.phone = { $regex: phone, $options: 'i' };
  if (city) userQuery.city = { $regex: city, $options: 'i' };
  if (search) {
    userQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  if (Object.keys(userQuery).length > 0) {
    const users = await User.find(userQuery).select('_id');
    const userIds = users.map(u => u._id);
    if (query.user) {
      // If query.user already exists (unlikely in this flow), intersect
      query.user = { $in: userIds };
    } else {
      query.user = { $in: userIds };
    }
  }

  if (search && !query.teacherId) {
    // If general search is provided and teacherId hasn't been specifically queried
    // We can also search teacherId in the main query if it wasn't filtered by user above
    if (!query.user) {
      query.$or = [
        { teacherId: { $regex: search, $options: 'i' } }
      ];
    } else {
      // Tricky with $or and other filters, but simple approach:
      // Already filtered by user above. If we want to add teacherId to that global search:
      const userIdArray = query.user.$in;
      delete query.user;
      query.$or = [
        { user: { $in: userIdArray } },
        { teacherId: { $regex: search, $options: 'i' } }
      ];
    }
  }

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
        { path: 'user', select: 'name email phone role gender city preferredMode' },
        { path: 'verifiedBy', select: 'name email phone role' },
        // Flat subject populate for list view — parent chain not needed here (saves 2 DB round-trips)
        { path: 'subjects', select: '_id label value type' },
      ])
      .lean({ virtuals: true }),
    Tutor.countDocuments(query),
  ]);

  const resolvedTutors = await Promise.all(tutors.map(t => withResolvedTutorDocumentUrls(t)));

  return { tutors: resolvedTutors, total, page, limit };
};

export const getTutorById = async (tutorIdOrTeacherId: string) => {
  let tutor = null as any;

  if (mongoose.isValidObjectId(tutorIdOrTeacherId)) {
    // First, try standard lookup by internal Tutor _id
    tutor = await Tutor.findById(tutorIdOrTeacherId).populate([
      { path: 'user', select: '_id name email phone role gender city preferredMode' },
      { path: 'verifiedBy', select: '_id name email phone role' },
      { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
    ]);

    // If not found, also allow treating the value as a User _id
    if (!tutor) {
      tutor = await Tutor.findOne({ user: new mongoose.Types.ObjectId(tutorIdOrTeacherId) }).populate([
        { path: 'user', select: 'name email phone role gender city preferredMode' },
        { path: 'verifiedBy', select: 'name email phone role' },
        { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
      ]);
    }
  }

  if (!tutor) {
    // Fallback: lookup by public teacherId (e.g. TMBPLxyz12)
    tutor = await Tutor.findOne({ teacherId: tutorIdOrTeacherId }).populate([
      { path: 'user', select: 'name email phone role gender city preferredMode' },
      { path: 'verifiedBy', select: 'name email phone role' },
      { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
    ]);
  }

  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  return await withResolvedTutorDocumentUrls(tutor);
};

export const getTutorByUserId = async (userId: string) => {
  const tutor = await Tutor.findOne({ user: userId }).populate([
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
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
    // Aggregate attendance counts per finalClass for this tutor using AttendanceSheet.
    const attendanceCounts = await AttendanceSheet.aggregate([
      {
        $match: {
          finalClass: { $in: classIds },
          // We assume sheets belong to the current tutor of the class or handled via finalClass association
          // If we want to be strict about who took the session, we might need to filter records inside sheet
          // But totalSessionsTaken is a good approximation for the class progress.
        },
      },
      {
        $group: {
          _id: '$finalClass',
          count: { $sum: '$totalSessionsTaken' },
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

  return await withResolvedTutorDocumentUrls(tutor);
};

export const getPublicTutorProfile = async (teacherId: string) => {
  const tutor = await Tutor.findOne({ teacherId }).populate([
    { path: 'user', select: 'name' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
  ]);

  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  console.log('--- DEBUG PUBLIC PROFILE ---');
  console.log('TeacherID:', teacherId);
  console.log('Total Docs in DB:', tutor.documents?.length || 0);
  console.log('Doc Types in DB:', (tutor.documents || []).map((d: any) => d.documentType).join(', '));
  console.log('----------------------------');

  // Calculate real teaching hours from attendance data
  const tutorUserId = new mongoose.Types.ObjectId(
    String(((tutor.user as any)?._id) || tutor.user)
  );

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
    const attendanceCounts = await AttendanceSheet.aggregate([
      {
        $match: {
          finalClass: { $in: classIds },
        },
      },
      {
        $group: {
          _id: '$finalClass',
          count: { $sum: '$totalSessionsTaken' },
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

  // Return only safe fields
  const result = {
    _id: tutor._id,
    teacherId: tutor.teacherId,
    user: tutor.user,
    experienceHours: totalClassHours,
    subjects: tutor.subjects,
    qualifications: tutor.qualifications,
    extracurricularActivities: tutor.extracurricularActivities,
    ratings: tutor.ratings,
    totalRatings: tutor.totalRatings,
    classesAssigned: tutor.classesAssigned,
    classesCompleted: tutor.classesCompleted,
    isAvailable: tutor.isAvailable,
    preferredMode: tutor.preferredMode,
    preferredLocations: tutor.preferredLocations,
    preferredCities: tutor.preferredCities,
    tier: tutor.tier,
    bio: tutor.bio,
    languagesKnown: tutor.languagesKnown,
    skills: tutor.skills,
    createdAt: tutor.createdAt,
    approvalRatio: tutor.approvalRatio,
    yearsOfExperience: tutor.yearsOfExperience,
  };

  // Resolve URLs directly here for maximum robustness
  const resolvedDocuments = await Promise.all(
    (tutor.documents || []).filter((d: any) => {
      const type = String(d.documentType || '').toUpperCase().trim();
      const url = String(d.documentUrl || '').toLowerCase();
      const isImage = /\.(jpg|jpeg|png|webp|gif|svg)/i.test(url);
      const isProfileType = type.includes('PROFILE') || type.includes('PHOTO') || type.includes('AVATAR');
      const isExcluded = ['AADHAR', 'PAN', 'RESUME', 'DEGREE', 'CERTIFICATE', 'MARKSHEET', 'IDCARD'].some(ex => type.includes(ex));
      return (isProfileType || isImage) && !isExcluded;
    }).map(async (doc: any) => {
      // Create a plain object from the subdocument if necessary
      const d = typeof doc.toObject === 'function' ? doc.toObject() : (doc._doc || doc);
      const rawKey = String(d.s3Key || d.documentUrl || '').trim();
      const resolved = await resolveS3DocumentUrl(rawKey);
      
      console.log(`[getPublicTutorProfile] Resolving Doc: Raw=${rawKey.substring(0, 30)} -> Final=${resolved.substring(0, 30)}`);
      
      return {
        ...d,
        documentUrl: resolved
      };
    })
  );

  (result as any).documents = resolvedDocuments;
  return result;
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
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
  ]);
  return await withResolvedTutorDocumentUrls(tutor);
};

export const getMyProfileForEdit = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);

  const tutor = await Tutor.findOne({ user: userId }).populate({
    path: 'subjects',
    populate: { path: 'parent', populate: { path: 'parent' } }
  });

  // Extract city and areas from preferredLocations
  let city = '';
  const preferredAreas: string[] = [];

  if (tutor?.preferredLocations && tutor.preferredLocations.length > 0) {
    // First location is typically the city
    city = tutor.preferredLocations[0];
    // Rest are areas
    if (tutor.preferredLocations.length > 1) {
      preferredAreas.push(...tutor.preferredLocations.slice(1));
    }
  }

  // Convert experienceHours to dropdown-compatible format
  let experience = '';
  if (tutor?.experienceHours) {
    const totalMonths = Math.floor(tutor.experienceHours / 30);
    const years = Math.floor(totalMonths / 12);

    if (years >= 10) {
      experience = '10+ Years';
    } else if (years >= 5) {
      experience = '5-10 Years';
    } else if (years >= 3) {
      experience = '3-5 Years';
    } else if (years >= 1) {
      experience = '1-2 Years';
    } else {
      experience = 'Fresher';
    }
  }

  return {
    fullName: user.name || '',
    gender: (user as any).gender || 'MALE',
    phoneNumber: user.phone || '',
    email: user.email || '',
    qualification: tutor?.qualifications?.[0] || '',
    experience,
    subjects: tutor?.subjects || [],
    extracurricularActivities: tutor?.extracurricularActivities || [],
    city,
    preferredAreas,
    preferredMode: tutor?.preferredMode || 'OFFLINE',
    permanentAddress: tutor?.permanentAddress || '',
    residentialAddress: tutor?.residentialAddress || '',
    alternatePhone: tutor?.alternatePhone || '',
    bio: tutor?.bio || '',
    languagesKnown: tutor?.languagesKnown || [],
    skills: tutor?.skills || [],
  };
};

function parseExperience(experience: string | undefined): { hours: number; years: number } {
  if (!experience) return { hours: 0, years: 0 };
  const num = Number((experience.match(/\d+/)?.[0] ?? '0'));
  if (!isFinite(num) || num <= 0) return { hours: 0, years: 0 };

  if (/year/i.test(experience)) {
    return {
      hours: 0, // Teaching hours start from 0 for new teachers
      years: num
    };
  }
  if (/month/i.test(experience)) {
    return {
      hours: 0, // Teaching hours start from 0 for new teachers
      years: Math.round((num / 12) * 10) / 10 // rounded to 1 decimal
    };
  }
  return { hours: 0, years: 0 };
}

export const updateMyProfile = async (userId: string, updateData: {
  fullName?: string;
  phoneNumber?: string;
  dob?: string | Date;
  gender?: string;
  qualification?: string;
  experience?: string;
  subjects?: string[];
  extracurricularActivities?: string[];
  city?: string;
  preferredAreas?: string[];
  preferredMode?: string;
  permanentAddress?: string;
  residentialAddress?: string;
  alternatePhone?: string;
  bio?: string;
  languagesKnown?: string[];
  skills?: string[];
  whatsappCommunityJoined?: boolean;
}) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);

  let tutor = await Tutor.findOne({ user: userId });

  // Update user fields
  if (updateData.fullName) user.name = updateData.fullName;
  if (updateData.phoneNumber) user.phone = updateData.phoneNumber;
  if (updateData.dob) user.dob = new Date(updateData.dob);
  if (updateData.gender) user.gender = updateData.gender as any;
  if (updateData.city) user.city = updateData.city;
  if (updateData.preferredMode) user.preferredMode = updateData.preferredMode;
  await user.save();

  // Prepare tutor data
  // IMPORTANT: only update fields if they are actually provided, otherwise we risk wiping existing values
  const tutorUpdateData: any = {};

  if ('experience' in updateData) {
    const { hours: experienceHours, years: yearsOfExperience } = parseExperience(updateData.experience);
    tutorUpdateData.experienceHours = experienceHours;
    tutorUpdateData.yearsOfExperience = yearsOfExperience;
  }

  if (Array.isArray(updateData.subjects)) {
    tutorUpdateData.subjects = updateData.subjects;
  }

  if ('qualification' in updateData) {
    tutorUpdateData.qualifications = updateData.qualification ? [updateData.qualification] : [];
  }

  if (Array.isArray(updateData.extracurricularActivities)) {
    tutorUpdateData.extracurricularActivities = updateData.extracurricularActivities;
  }

  if ('preferredMode' in updateData) {
    tutorUpdateData.preferredMode = updateData.preferredMode;
  }

  if ('permanentAddress' in updateData) {
    tutorUpdateData.permanentAddress = updateData.permanentAddress;
  }
  if ('residentialAddress' in updateData) {
    tutorUpdateData.residentialAddress = updateData.residentialAddress;
  }
  if ('alternatePhone' in updateData) {
    tutorUpdateData.alternatePhone = updateData.alternatePhone;
  }
  if ('bio' in updateData) {
    tutorUpdateData.bio = updateData.bio;
  }
  if (Array.isArray(updateData.languagesKnown)) {
    tutorUpdateData.languagesKnown = updateData.languagesKnown;
  }
  if (Array.isArray(updateData.skills)) {
    tutorUpdateData.skills = updateData.skills;
  }

  const locationFieldsProvided = 'city' in updateData || 'preferredAreas' in updateData;
  if (locationFieldsProvided) {
    const preferredLocations: string[] = [];
    const preferredCities: string[] = [];

    if (updateData.city) {
      preferredLocations.push(updateData.city);
      preferredCities.push(updateData.city);
    }
    if (Array.isArray(updateData.preferredAreas)) {
      updateData.preferredAreas.forEach((a: string) => {
        if (a && a.trim()) preferredLocations.push(a.trim());
      });
    }

    tutorUpdateData.preferredLocations = preferredLocations;
    tutorUpdateData.preferredCities = preferredCities;
  }

  if (typeof updateData.whatsappCommunityJoined === 'boolean') {
    tutorUpdateData.whatsappCommunityJoined = updateData.whatsappCommunityJoined;
  }

  if (tutor) {
    // Update existing tutor
    Object.assign(tutor, tutorUpdateData);
    await tutor.save();
  } else {
    // Create new tutor profile if it doesn't exist
    tutor = await Tutor.create({
      user: userId,
      ...tutorUpdateData,
    });
  }

  await tutor.populate([
    { path: 'user', select: 'name email phone dob role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
  ]);

  return await withResolvedTutorDocumentUrls(tutor);
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
  await tutor.populate([{ path: 'user', select: 'name email phone role gender city preferredMode' }]);
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

  // Upload buffer to S3
  const buffer: Buffer | undefined = file?.buffer;
  const originalname: string = file?.originalname || 'document';
  const mimetype: string = file?.mimetype || 'application/octet-stream';

  if (!buffer) {
    console.error('[uploadDocument] Invalid file upload - missing buffer', {
      tutorId,
      documentType,
      originalname,
      hasFile: !!file,
    });
    throw new ErrorResponse('Invalid file upload', 400);
  }

  let uploadResult: { key: string; url: string; bucket: string };
  try {
    const folder = documentType === 'PROFILE_PHOTO' 
      ? S3_CONFIG.FOLDERS.PROFILE_PHOTOS 
      : S3_CONFIG.FOLDERS.DOCUMENTS;

    uploadResult = await uploadFileToS3Structured(
      buffer,
      originalname,
      mimetype,
      { entityType: 'tutors', entityId: tutorId, folder }
    );
    console.log('[uploadDocument] S3 upload successful', {
      tutorId,
      documentType,
      s3Key: uploadResult.key,
    });
  } catch (err: any) {
    console.error('[uploadDocument] S3 upload failed', {
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
    documentUrl: uploadResult.key,
    uploadedAt: new Date(),
    s3Key: uploadResult.key,
    s3Bucket: uploadResult.bucket,
  } as any;
  try {
    const previousStatus = tutor.verificationStatus as VERIFICATION_STATUS;

    if (
      documentType !== 'PROFILE_PHOTO' &&
      Array.isArray(tutor.documents) &&
      tutor.documents.some((d: any) => d?.documentType === documentType)
    ) {
      throw new ErrorResponse(
        'This document type has already been uploaded. Please delete the existing one before uploading again.',
        409
      );
    }

    // Profile photo should be replaceable: remove previous profile photo (and delete from S3)
    if (documentType === 'PROFILE_PHOTO' && Array.isArray(tutor.documents) && tutor.documents.length > 0) {
      const previousPhotos = (tutor.documents as any[]).filter((d) => d?.documentType === 'PROFILE_PHOTO');
      for (const p of previousPhotos) {
        if (p?.s3Key) {
          try {
            await deleteFileFromS3(p.s3Key);
          } catch { }
        }
      }
      tutor.documents = (tutor.documents as any[]).filter((d) => d?.documentType !== 'PROFILE_PHOTO') as any;
    }

    tutor.documents.push(doc);

    // Only verification documents should affect verificationStatus
    if (documentType !== 'PROFILE_PHOTO') {
      // If tutor was pending, move to UNDER_REVIEW because a verification document was uploaded
      if (previousStatus === VERIFICATION_STATUS.PENDING) {
        tutor.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
      }

      // If verification was previously rejected, any new upload should trigger re-review
      if (previousStatus === VERIFICATION_STATUS.REJECTED) {
        tutor.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
        tutor.verifiedBy = undefined as any;
        tutor.verifiedAt = undefined;
      }
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
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return await withResolvedTutorDocumentUrls(tutor);
};

export const deleteDocument = async (tutorId: string, documentIndex: number) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);
  if (!Array.isArray(tutor.documents) || documentIndex < 0 || documentIndex >= tutor.documents.length) {
    throw new ErrorResponse('Invalid document index', 400);
  }

  const doc: any = tutor.documents[documentIndex];
  if (doc?.s3Key) {
    try {
      await deleteFileFromS3(doc.s3Key);
      console.log('[deleteDocument] S3 file deleted', { tutorId, s3Key: doc.s3Key });
    } catch (err: any) {
      console.error('[deleteDocument] S3 delete failed', { tutorId, s3Key: doc.s3Key, error: err?.message });
    }
  }

  tutor.documents.splice(documentIndex, 1);
  await tutor.save();
  await tutor.populate([
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return await withResolvedTutorDocumentUrls(tutor);
};

export const updateVerificationStatus = async (
  tutorId: string,
  newStatus: VERIFICATION_STATUS,
  verificationNotes: string | undefined,
  verifiedBy: string,
  whatsappCommunityJoined?: boolean
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  if (typeof whatsappCommunityJoined === 'boolean') {
    tutor.whatsappCommunityJoined = whatsappCommunityJoined;
  }

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
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
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
  } catch { }

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
        { path: 'user', select: 'name email phone role gender city preferredMode' },
        { path: 'verifiedBy', select: 'name email phone role' },
        { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
      ]),
    Tutor.countDocuments(query),
  ]);

  return { tutors, total, page, limit };
};

export const updateVerificationFeeStatus = async (
  tutorId: string,
  feeStatus: 'PENDING' | 'PAID' | 'DEDUCT_FROM_FIRST_MONTH',
  paymentProofFile?: any
) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  let verificationFeePaymentProof = tutor.verificationFeePaymentProof;
  let verificationFeePaymentDate = tutor.verificationFeePaymentDate;

  if (feeStatus === 'PAID') {
    if (!paymentProofFile) {
      throw new ErrorResponse('Payment proof is required when status is PAID', 400);
    }

    // Upload proof
    const buffer = paymentProofFile.buffer;
    const originalname = paymentProofFile.originalname;
    const mimetype = paymentProofFile.mimetype;

    try {
      const uploadResult = await uploadFileToS3Structured(
        buffer,
        originalname,
        mimetype,
        { entityType: 'tutors', entityId: tutorId, folder: 'verification-fees' }
      );
      verificationFeePaymentProof = uploadResult.key;
      verificationFeePaymentDate = new Date();
    } catch (err: any) {
      console.error('Failed to upload payment proof', err);
      throw new ErrorResponse('Failed to upload payment proof', 500);
    }

    // Create a paid Payment record for bookkeeping
    try {
      const dueDate = verificationFeePaymentDate || new Date();
      await Payment.create({
        tutor: tutor.user,
        amount: VERIFICATION_FEE_AMOUNT,
        currency: 'INR',
        status: PAYMENT_STATUS.PAID,
        paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
        dueDate,
        paymentDate: verificationFeePaymentDate,
        paymentProof: verificationFeePaymentProof,
        createdBy: tutor.user,
      } as any);
    } catch (err: any) {
      console.error('Failed to create verification fee payment record', err);
      // non-fatal: continue
    }
  } else if (feeStatus === 'DEDUCT_FROM_FIRST_MONTH') {
    // Create a pending verification fee record to be deducted from first payout (bookkeeping)
    try {
      const dueDate = new Date();
      await Payment.create({
        tutor: tutor.user,
        amount: VERIFICATION_FEE_DEDUCT_AMOUNT,
        currency: 'INR',
        status: PAYMENT_STATUS.PENDING,
        paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
        dueDate,
        notes: 'Deduct from first payout',
        createdBy: tutor.user,
      } as any);
    } catch (err: any) {
      console.error('Failed to create deduction verification fee record', err);
    }
  }

  tutor.verificationFeeStatus = feeStatus;
  if (verificationFeePaymentProof) tutor.verificationFeePaymentProof = verificationFeePaymentProof;
  if (verificationFeePaymentDate) tutor.verificationFeePaymentDate = verificationFeePaymentDate;

  await tutor.save();
  await tutor.populate([
    { path: 'user', select: 'name email phone role gender city preferredMode' },
    { path: 'verifiedBy', select: 'name email phone role' },
    { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
  ]);
  return tutor;
};

export const getTutorsForVerification = async () => {
  const tutors = await Tutor.find({
    verificationStatus: VERIFICATION_STATUS.UNDER_REVIEW,
    documents: { $ne: [] },
  })
    .sort({ updatedAt: 1 })
    .populate([
      { path: 'user', select: 'name email phone role gender city preferredMode' },
      { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
    ]);

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
      if (d?.s3Key) {
        try {
          await deleteFileFromS3(d.s3Key);
        } catch { }
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
  } catch { }

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
  } catch { }

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
  } catch { }

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
        { path: 'subjects', populate: { path: 'parent', populate: { path: 'parent' } } },
      ]),
    Tutor.countDocuments(query),
  ]);

  // Attach lightweight metrics if needed (approvalRatio already virtual)
  const tutorsWithMetrics = tutors;

  return { tutors: tutorsWithMetrics as any, total, page, limit };
};

export const getPendingTierChanges = async () => {
  const tutors = await Tutor.find({
    pendingTierChange: { $exists: true, $ne: null },
  })
    .sort({ 'pendingTierChange.requestedAt': 1 })
    .populate([
      { path: 'user', select: 'name email phone' },
      { path: 'pendingTierChange.requestedBy', select: 'name email' },
    ]);

  return tutors;
};

export const updateTutorExperienceAndTier = async (tutorUserId: string | mongoose.Types.ObjectId) => {
  const tutor = await Tutor.findOne({ user: tutorUserId });
  if (!tutor) return;

  const objectId = new mongoose.Types.ObjectId(String(tutorUserId));

  // 1. Calculate total experience hours
  const allTutorClasses = await FinalClass.find({
    $or: [{ tutor: objectId }, { tutorUser: objectId }],
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
    const attendanceCounts = await Attendance.aggregate([
      {
        $match: {
          tutor: objectId,
          finalClass: { $in: classIds },
          status: { $in: [ATTENDANCE_STATUS.APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED, ATTENDANCE_STATUS.COORDINATOR_APPROVED] }
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

  // 2. Determine Tier
  // Default: Tier 3 (BRONZE)
  // > 300: Tier 2 (SILVER)
  // > 1000: Tier 1 (GOLD)
  let newTier = TUTOR_TIER.BRONZE;
  if (totalClassHours >= 1000) {
    newTier = TUTOR_TIER.GOLD;
  } else if (totalClassHours >= 300) {
    newTier = TUTOR_TIER.SILVER;
  }

  // 3. Update if changed
  let updated = false;
  if (tutor.experienceHours !== totalClassHours) {
    tutor.experienceHours = totalClassHours;
    updated = true;
  }

  if (tutor.tier !== newTier) {
    tutor.tier = newTier;
    tutor.tierUpdatedAt = new Date();
    // Auto-system update, no tierUpdatedBy
    updated = true;

    // Notify
    try {
      await Notification.create({
        user: tutor.user,
        type: 'TIER_CHANGE',
        title: 'Tier Upgraded!',
        message: `Congratulations! Your tier has been upgraded to ${newTier} based on your teaching hours (${totalClassHours} hrs).`,
      } as any);
    } catch { }
  }

  if (updated) {
    await tutor.save();
  }

  return tutor;
};

export const getDistinctSubjects = async () => {
  const Option = mongoose.model('Option');
  const subjects = await Option.find({ type: 'SUBJECT' }).populate({
    path: 'parent',
    populate: { path: 'parent' }
  }).lean();

  const formattedSubjects = subjects.map((s: any) => {
    const parts = [];
    let current = s;
    while (current) {
      parts.unshift(current.label);
      current = current.parent;
    }
    return {
      _id: s._id,
      label: parts.join(' . ')
    };
  });

  return formattedSubjects.sort((a, b) => a.label.localeCompare(b.label));
};

export const getDistinctVerifiers = async () => {
  const verifierIds = await Tutor.distinct('verifiedBy');
  const validIds = verifierIds.filter(Boolean);

  if (validIds.length === 0) return [];

  const verifiers = await User.find({ _id: { $in: validIds } })
    .select('name email')
    .lean();

  return verifiers;
};
export const getDistinctCities = async () => {
  const cities = await User.distinct('city', { role: USER_ROLES.TUTOR });
  return cities.filter(Boolean).sort();
};
export const getDistinctAreas = async () => {
  const allLocations = await Tutor.distinct('preferredLocations');
  // preferredLocations might contain cities too, so we'll filter them out in the frontend or just provide all unique locations.
  // Actually, providing all unique locations that are NOT in the cities list.
  const cities = await User.distinct('city', { role: USER_ROLES.TUTOR });
  const citySet = new Set(cities.filter(Boolean));

  const uniqueAreas = Array.from(new Set(allLocations.flat()))
    .filter(loc => loc && !citySet.has(loc))
    .sort();
  return uniqueAreas;
};

export const getTutorAdvancedAnalytics = async (tutorUserId: string) => {
  const tutor = await Tutor.findOne({ user: tutorUserId });
  if (!tutor) throw new ErrorResponse('Tutor profile not found', 404);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const uid = new mongoose.Types.ObjectId(tutorUserId);

  // 1. Sessions Analytics
  const [completedWeek, completedMonth] = await Promise.all([
    Attendance.countDocuments({
      tutor: uid,
      status: { $in: [ATTENDANCE_STATUS.APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED, ATTENDANCE_STATUS.COORDINATOR_APPROVED] },
      sessionDate: { $gte: startOfWeek },
    }),
    Attendance.countDocuments({
      tutor: uid,
      status: { $in: [ATTENDANCE_STATUS.APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED, ATTENDANCE_STATUS.COORDINATOR_APPROVED] },
      sessionDate: { $gte: startOfMonth },
    }),
  ]);

  // 2. Earnings Analytics
  const [earningsWeek, earningsMonth, totalEarnings] = await Promise.all([
    Payment.aggregate([
      { $match: { tutor: uid, status: PAYMENT_STATUS.PAID, paymentType: PAYMENT_TYPE.TUTOR_PAYOUT, paymentDate: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { tutor: uid, status: PAYMENT_STATUS.PAID, paymentType: PAYMENT_TYPE.TUTOR_PAYOUT, paymentDate: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { tutor: uid, status: PAYMENT_STATUS.PAID, paymentType: PAYMENT_TYPE.TUTOR_PAYOUT } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  // 3. New Classes Analytics (Converted this month)
  const newClassesCount = await FinalClass.countDocuments({
    $or: [{ tutor: uid }, { tutorUser: uid }],
    convertedAt: { $gte: startOfMonth },
  });

  // 4. Demo Analytics
  const demos = await DemoHistory.find({ tutor: uid });
  const totalDemos = demos.length;
  const approvedDemos = demos.filter(d => d.status === DEMO_STATUS.APPROVED).length;
  const rejectedDemos = demos.filter(d => d.status === DEMO_STATUS.REJECTED).length;
  const demoApprovalRate = totalDemos > 0 ? (approvedDemos / totalDemos) * 100 : 0;
  const decidedDemos = approvedDemos + rejectedDemos;
  const demoRemovalRate = decidedDemos > 0 ? (rejectedDemos / decidedDemos) * 100 : 0;

  // 5. Class-wise Earnings
  const classWiseEarnings = await Payment.aggregate([
    { $match: { tutor: uid, status: PAYMENT_STATUS.PAID, paymentType: PAYMENT_TYPE.TUTOR_PAYOUT } },
    {
      $group: {
        _id: '$finalClass',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'finalclasses',
        localField: '_id',
        foreignField: '_id',
        as: 'classDetails',
      },
    },
    { $unwind: '$classDetails' },
    {
      $project: {
        className: '$classDetails.className',
        studentName: '$classDetails.studentName',
        totalAmount: 1,
        count: 1,
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  // 6. Teaching hours (current month)
  // Attendance has been moving to AttendanceSheet.records, so compute from sheets.
  const teachingHoursAgg = await AttendanceSheet.aggregate([
    {
      $match: {
        // Only sheets that have at least one record in the requested time window
        // We'll filter precisely after unwind.
      },
    },
    { $unwind: '$records' },
    {
      $match: {
        'records.tutor': uid,
        'records.status': {
          $in: [ATTENDANCE_STATUS.APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED, ATTENDANCE_STATUS.COORDINATOR_APPROVED],
        },
        'records.sessionDate': { $gte: startOfMonth },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$records.durationHours' },
      },
    },
  ]);

  const totalTeachingHours = Number(teachingHoursAgg?.[0]?.total || 0);

  return {
    sessions: {
      completedThisWeek: completedWeek,
      completedThisMonth: completedMonth,
    },
    earnings: {
      thisWeek: earningsWeek[0]?.total || 0,
      thisMonth: earningsMonth[0]?.total || 0,
      total: totalEarnings[0]?.total || 0,
    },
    totalTeachingHours,
    newClassesCount,
    demos: {
      total: totalDemos,
      approved: approvedDemos,
      removed: rejectedDemos,
      approvalRate: Number(demoApprovalRate.toFixed(2)),
      removalRate: Number(demoRemovalRate.toFixed(2)),
    },
    classWiseEarnings,
  };
};
