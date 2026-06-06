import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  createTutorProfile,
  getAllTutors,
  getTutorById,
  getTutorByUserId,
  updateTutorProfile,
  updateTutorSettings,
  uploadDocument as uploadDocumentService,
  deleteDocument as deleteDocumentService,
  updateVerificationStatus as updateVerificationStatusService,
  getTutorsByVerificationStatus,
  getTutorsForVerification,
  deleteTutorProfile as deleteTutorProfileService,
  requestTierChange,
  approveTierChange,
  submitTutorFeedback,
  getTutorFeedback,
  getTutorPerformanceMetrics,
  getTutorAdvancedAnalytics,
  getTutorsByCoordinator,
  getPublicTutorProfile,
  getMyProfileForEdit,
  updateMyProfile,
  getDistinctSubjects,
  getDistinctVerifiers,
  getDistinctCities,
  getDistinctAreas,
  updateVerificationFeeStatus,
  submitTutorVerification,
  getVerificationFeeDebug,
} from '../services/tutorService';
import { processManualFeeDeduction } from '../services/paymentService';
import { PAYMENT_TYPE, PAYMENT_STATUS } from '../config/constants';

export const createTutorProfileController = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const { userId, experienceHours, subjects, qualifications, preferredMode, preferredLocations } = req.body;
  const tutor = await createTutorProfile(userId, Number(experienceHours), subjects, qualifications, preferredMode, preferredLocations);
  return res.status(201).json(successResponse(tutor, 'Tutor profile created successfully'));
});

export const getTutors = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || '1'), 10);
  const limit = parseInt(String(req.query.limit || '10'), 10);
  const verificationStatus = req.query.verificationStatus as any;
  const isAvailable = typeof req.query.isAvailable !== 'undefined' ? String(req.query.isAvailable) === 'true' : undefined;
  const subjects = req.query.subjects ? String(req.query.subjects).split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined;
  const sortOrder = (req.query.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const search = req.query.search as string;
  const teacherId = req.query.teacherId as string;
  const name = req.query.name as string;
  const email = req.query.email as string;
  const phone = req.query.phone as string;
  const preferredMode = req.query.preferredMode as string;
  const verifiedBy = req.query.verifiedBy as string;
  const city = req.query.city as string;
  const area = req.query.area as string;
  const grade = req.query.grade as string;
  const board = req.query.board as string;

  const { tutors, total } = await getAllTutors(
    page,
    limit,
    verificationStatus,
    isAvailable as any,
    subjects,
    sortBy,
    sortOrder,
    search,
    teacherId,
    name,
    email,
    phone,
    preferredMode,
    verifiedBy,
    city,
    area,
    grade,
    board
  );
  return res.json(paginatedResponse(tutors as any, page, limit, total));
});

export const getTutor = asyncHandler(async (req: Request, res: Response) => {
  const tutor = await getTutorById(req.params.id);
  return res.json(successResponse(tutor));
});

export const getTutorByUser = asyncHandler(async (req: Request, res: Response) => {
  const tutor = await getTutorByUserId(req.params.userId);
  return res.json(successResponse(tutor));
});

export const getMyProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tutor = await getTutorByUserId(String(req.user!.id));
  return res.json(successResponse(tutor));
});

export const getMyProfileForEditController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const profileData = await getMyProfileForEdit(String(req.user!.id));
  return res.json(successResponse(profileData));
});

export const updateMyProfileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tutorUser = await getTutorByUserId(String(req.user!.id));

  // Lock permanent identity fields for verified tutors
  if (tutorUser && (tutorUser as any).verificationStatus === 'VERIFIED') {
    const userDoc = await (mongoose.models.User || mongoose.model('User')).findById(req.user!.id);
    const changedLockedFields: string[] = [];

    const strDiff = (newVal: any, oldVal: any) => String(newVal || '').trim() !== String(oldVal || '').trim();

    if ('fullName' in req.body && strDiff(req.body.fullName, userDoc?.name)) {
      changedLockedFields.push('fullName');
    }
    if ('email' in req.body && strDiff(req.body.email, userDoc?.email)) {
      changedLockedFields.push('email');
    }
    if ('phoneNumber' in req.body && strDiff(req.body.phoneNumber, userDoc?.phone)) {
      changedLockedFields.push('phoneNumber');
    }
    if ('gender' in req.body && strDiff(req.body.gender, userDoc?.gender)) {
      changedLockedFields.push('gender');
    }
    if ('dob' in req.body) {
      const newDob = req.body.dob ? new Date(req.body.dob).toDateString() : '';
      const oldDob = userDoc?.dob ? new Date(userDoc.dob).toDateString() : '';
      if (newDob !== oldDob) changedLockedFields.push('dob');
    }
    if ('qualification' in req.body && strDiff(req.body.qualification, tutorUser.qualifications?.[0])) {
      changedLockedFields.push('qualification');
    }
    if ('experience' in req.body) {
      const parseExpYears = (exp: string | undefined): number => {
        if (!exp) return 0;
        const num = Number((exp.match(/\d+/)?.[0] ?? '0'));
        return isFinite(num) && num > 0 ? num : 0;
      };
      if (parseExpYears(req.body.experience) !== (tutorUser.yearsOfExperience || 0)) {
        changedLockedFields.push('experience');
      }
    }
    if ('permanentAddress' in req.body && strDiff(req.body.permanentAddress, tutorUser.permanentAddress)) {
      changedLockedFields.push('permanentAddress');
    }
    if ('residentialAddress' in req.body && strDiff(req.body.residentialAddress, tutorUser.residentialAddress)) {
      changedLockedFields.push('residentialAddress');
    }
    if ('extracurricularActivities' in req.body) {
      const newExtra = Array.isArray(req.body.extracurricularActivities) ? [...req.body.extracurricularActivities].map(String).sort() : [];
      const oldExtra = Array.isArray(tutorUser.extracurricularActivities) ? [...tutorUser.extracurricularActivities].map(String).sort() : [];
      if (JSON.stringify(newExtra) !== JSON.stringify(oldExtra)) {
        changedLockedFields.push('extracurricularActivities');
      }
    }

    if (changedLockedFields.length > 0) {
      throw new ErrorResponse(
        `Cannot update the following fields after verification: ${changedLockedFields.join(', ')}`,
        403
      );
    }
  }

  const tutor = await updateMyProfile(String(req.user!.id), req.body);
  return res.json(successResponse(tutor, 'Profile updated successfully'));
});

export const updateTutorProfileController = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const tutor = await updateTutorProfile(req.params.id, req.body);
  return res.json(successResponse(tutor, 'Tutor profile updated successfully'));
});

export const updateTutorSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const tutorId = req.params.tutorId;
  const settingsData = req.body;
  const tutor = await updateTutorSettings(tutorId, settingsData);
  return res.status(200).json(successResponse(tutor, 'Tutor settings updated successfully'));
});

export const uploadDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const file = (req as any).file as any | undefined;
  if (!file) throw new ErrorResponse('No file uploaded', 400);

  const documentType = String(req.body.documentType);

  // Item 27: Enforce document upload rules based on tutor verification status
  const existingTutor = await getTutorById(req.params.id);
  if (!existingTutor) throw new ErrorResponse('Tutor not found', 404);

  const status = (existingTutor as any).verificationStatus;

  // Profile photo should always be changeable (even after verification)
  if (status === 'VERIFIED' && documentType !== 'PROFILE_PHOTO') {
    throw new ErrorResponse('Documents cannot be changed after verification', 403);
  }

  // REJECTED status or no documents yet → allow upload

  const tutor = await uploadDocumentService(req.params.id, documentType, file);
  return res.json(successResponse(tutor, 'Document uploaded successfully'));
});

export const deleteDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const index = parseInt(req.params.documentIndex, 10);
  const tutor = await deleteDocumentService(req.params.id, index);
  return res.json(successResponse(tutor, 'Document deleted successfully'));
});

// This controller (updateVerificationStatusController) handles VERIFICATION STATUS (Verified/Pending)
export const updateVerificationStatusController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const { status, verificationNotes, whatsappCommunityJoined, rejectionReason } = req.body;
  const tutor = await updateVerificationStatusService(req.params.id, status, verificationNotes, String(req.user!.id), whatsappCommunityJoined, rejectionReason);
  return res.json(successResponse(tutor, 'Verification status updated successfully'));
});

export const updateVerificationFeeStatusController = asyncHandler(async (req: Request, res: Response) => {
  const { verificationFeeStatus } = req.body;
  const file = (req as any).file;

  const tutor = await updateVerificationFeeStatus(req.params.id, verificationFeeStatus, file);
  return res.json(successResponse(tutor, 'Verification fee status updated successfully'));
});

export const getVerificationFeeDebugController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getVerificationFeeDebug(req.params.id);
  return res.json(successResponse(result, 'Verification fee debug info'));
});

export const deductVerificationFeeController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await processManualFeeDeduction(req.params.id, String(req.user!.id));
  return res.json(successResponse(result, result.message));
});

export const submitTutorVerificationController = asyncHandler(async (req: Request, res: Response) => {
  const tutorId = req.params.id;
  const tutor = await submitTutorVerification(tutorId);
  return res.json(successResponse(tutor, 'Verification submitted for review successfully'));
});

export const getTutorsByStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = req.params.status as any;
  const page = parseInt(String(req.query.page || '1'), 10);
  const limit = parseInt(String(req.query.limit || '10'), 10);
  const { tutors, total } = await getTutorsByVerificationStatus(status, page, limit);
  return res.json(paginatedResponse(tutors as any, page, limit, total));
});

export const getPendingVerifications = asyncHandler(async (_req: Request, res: Response) => {
  const tutors = await getTutorsForVerification();
  return res.json(successResponse(tutors));
});

export const getPublicTutorReviewsController = asyncHandler(async (req: Request, res: Response) => {
  const teacherKey = req.params.teacherKey;
  const page = parseInt(String(req.query.page || '1'), 10);
  const limit = parseInt(String(req.query.limit || '5'), 10);
  const tutor = await getTutorById(teacherKey);
  const tutorId = String((tutor as any)._id);
  const { feedback, total } = await getTutorFeedback({ tutorId, page, limit });
  const mapped = (feedback as any[]).map((fb) => {
    const finalClass = fb.finalClass as any;
    const submittedBy = fb.submittedBy as any;
    return {
      id: String(fb._id),
      studentName: finalClass?.studentName || submittedBy?.name || 'Student',
      submitterRole: fb.submitterRole,
      overallRating: fb.overallRating,
      comments: fb.comments,
      createdAt: fb.createdAt,
    };
  });
  return res.json(paginatedResponse(mapped as any, page, limit, total));
});

export const getPublicTutorProfileController = asyncHandler(async (req: Request, res: Response) => {
  const tutor = await getPublicTutorProfile(req.params.teacherId);
  return res.json(successResponse(tutor));
});

export const deleteTutorProfileController = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteTutorProfileService(req.params.id);
  return res.json(successResponse(result, 'Tutor profile deleted successfully'));
});

export const requestTierChangeController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { tutorId, newTier, reason } = req.body;
  const requestedBy = String(req.user!.id);
  const tutor = await requestTierChange({ tutorId, newTier, reason, requestedBy });
  return res.status(200).json(successResponse(tutor, 'Tier change request submitted successfully'));
});

export const approveTierChangeController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const tutorId = req.params.tutorId;
  const { approve, notes } = req.body as { approve: boolean; notes?: string };
  const approvedBy = String(req.user!.id);
  const tutor = await approveTierChange({ tutorId, approve, approvedBy, notes });
  return res.json(successResponse(tutor, approve ? 'Tier change approved' : 'Tier change rejected'));
});

export const submitTutorFeedbackController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { tutorId, finalClassId, submitterRole, month, ratings, comments, strengths, improvements, wouldRecommend } = req.body;
  const submittedBy = String(req.user!.id);
  const feedback = await submitTutorFeedback({ tutorId, finalClassId, submittedBy, submitterRole, month, ratings, comments, strengths, improvements, wouldRecommend });
  return res.status(201).json(successResponse(feedback, 'Feedback submitted successfully'));
});

export const getTutorFeedbackController = asyncHandler(async (req: Request, res: Response) => {
  const tutorId = req.params.tutorId;
  const page = parseInt(String(req.query.page || '1'), 10);
  const limit = parseInt(String(req.query.limit || '10'), 10);
  const month = req.query.month ? String(req.query.month) : undefined;
  const finalClassId = req.query.finalClassId ? String(req.query.finalClassId) : undefined;
  const { feedback, total } = await getTutorFeedback({ tutorId, page, limit, month, finalClassId });
  return res.json(paginatedResponse(feedback as any, page, limit, total));
});

export const getTutorPerformanceMetricsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  let tutorId = req.params.tutorId;
  // If the requester is a TUTOR, always use their own id (self-access only)
  if (req.user && req.user.role === 'TUTOR') {
    tutorId = String(req.user.id);
  }
  const coordinatorUserId = (req.user && req.user.role === 'COORDINATOR') ? String(req.user.id) : undefined;
  const metrics = await getTutorPerformanceMetrics({ tutorId, coordinatorUserId });
  return res.json(successResponse(metrics));
});
export const getTutorAdvancedAnalyticsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  let tutorId = req.params.tutorId;
  if (req.user && req.user.role === 'TUTOR') {
    tutorId = String(req.user.id);
  }
  const analytics = await getTutorAdvancedAnalytics(tutorId);
  return res.json(successResponse(analytics));
});

export const getCoordinatorTutorsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const coordinatorUserId = String(req.user!.id);
  const page = parseInt(String(req.query.page || '1'), 10);
  const limit = parseInt(String(req.query.limit || '9'), 10);
  const tier = req.query.tier ? String(req.query.tier) : undefined;
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined;
  const sortOrder = (req.query.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const { tutors, total } = await getTutorsByCoordinator({ coordinatorUserId, page, limit, tier, sortBy, sortOrder });
  return res.json(paginatedResponse(tutors as any, page, limit, total));
});

export const getTutorStatsController = asyncHandler(async (req: Request, res: Response) => {
  const tutorId = req.params.id;
  const tutor = await getTutorById(tutorId);
  if (!tutor) throw new ErrorResponse('Tutor not found', 404);

  const userId = tutor.user.id || (tutor.user as any)._id;

  // 1. One-time Reschedules (from FinalClass)
  const FinalClass = mongoose.model('FinalClass');
  const classes = await FinalClass.find({ tutor: userId });
  const oneTimeReschedules = classes.reduce((sum: number, cls: any) => sum + (cls.oneTimeReschedules?.length || 0), 0);

  // 2. Total Tutor Payouts
  const Payment = mongoose.model('Payment');
  const payouts = await Payment.aggregate([
    {
      $match: {
        tutor: new mongoose.Types.ObjectId(String(userId)),
        paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
        status: PAYMENT_STATUS.PAID
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  const totalPayouts = payouts.length > 0 ? payouts[0].total : 0;

  // 3. Total Attendance Sheets Submitted
  const Attendance = mongoose.model('Attendance');
  const attendanceSheetsSubmitted = await Attendance.countDocuments({ tutor: userId });

  // 4. Demos Scheduled
  const ClassLead = mongoose.model('ClassLead');
  const demosScheduled = await ClassLead.countDocuments({ demoTutor: userId });

  return res.json(successResponse({
    oneTimeReschedules,
    totalPayouts,
    attendanceSheetsSubmitted,
    demosScheduled
  }));
});

export const getSubjectsController = asyncHandler(async (_req: Request, res: Response) => {
  const subjects = await getDistinctSubjects();
  return res.json(successResponse(subjects));
});
export const getVerifiersController = asyncHandler(async (_req: Request, res: Response) => {
  const verifiers = await getDistinctVerifiers();
  return res.json(successResponse(verifiers));
});
export const getCitiesController = asyncHandler(async (_req: Request, res: Response) => {
  const cities = await getDistinctCities();
  return res.json(successResponse(cities));
});
export const getAreasController = asyncHandler(async (_req: Request, res: Response) => {
  const areas = await getDistinctAreas();
  return res.json(successResponse(areas));
});
