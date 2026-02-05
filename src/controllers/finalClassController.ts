import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import FinalClass from '../models/FinalClass';
import Coordinator from '../models/Coordinator';
import User from '../models/User';
import { FINAL_CLASS_STATUS, COORDINATOR_ACTION_TYPE, USER_ROLES } from '../config/constants';
import { createNotificationWithPreferences } from '../services/notificationService';
import { sendEmail } from '../utils/emailService';
import {
  convertLeadToFinalClass,
  getAllFinalClasses,
  getFinalClassById,
  updateFinalClass,
  updateFinalClassStatus,
  updateSessionProgress,
  getClassesByCoordinator,
  getClassesByTutor,
  getClassesByParent,
  changeTutor,
  handleTutorLeaving,
} from '../services/finalClassService';
import { repostClassAsLead } from '../services/leadService';
import { logCoordinatorActivity } from '../services/coordinatorService';
// FINAL_CLASS_STATUS already imported above

export const convertToFinalClass = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classLeadId = req.params.leadId as string;
  const { coordinatorUserId, startDate, schedule, totalSessions, notes } = req.body;
  const convertedBy = req.user!.id;

  const result = await convertLeadToFinalClass({
    classLeadId,
    coordinatorUserId,
    startDate,
    schedule,
    totalSessions,
    notes,
    convertedBy,
  });

  return res.status(201).json(successResponse(result, 'Class lead converted to final class successfully'));
});

export const getFinalClasses = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const status = (req.query.status as string) || undefined;
  const coordinatorId = (req.query.coordinatorId as string) || undefined;
  const tutorId = (req.query.tutorId as string) || undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;
  const search = (req.query.search as string) || undefined;
  const noCoordinator = req.query.noCoordinator === 'true';

  let convertedBy: string | undefined = undefined;
  if (req.user && req.user.role === USER_ROLES.MANAGER && !tutorId && !coordinatorId && !search) {
    convertedBy = req.user.id;
  }

  const { classes, total } = await getAllFinalClasses({
    page,
    limit,
    status,
    coordinatorId,
    tutorId,
    sortBy,
    sortOrder,
    search,
    convertedBy,
    noCoordinator,
  });

  return res.json(paginatedResponse(classes, page, limit, total));
});

export const getFinalClass = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const cls = await getFinalClassById(classId);
  return res.json(successResponse(cls));
});

export const updateFinalClassDetails = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const updateData = req.body;
  const cls = await updateFinalClass(classId, updateData);

  // Log coordinator-initiated updates to final classes
  if (req.user?.role === USER_ROLES.COORDINATOR) {
    try {
      await logCoordinatorActivity(
        req.user.id,
        COORDINATOR_ACTION_TYPE.UPDATE_FINAL_CLASS,
        'Updated final class details',
        { entityType: 'FinalClass', entityId: classId, entityName: (cls as any)?.className },
        { updateData }
      );
    } catch {}
  }

  return res.json(successResponse(cls, 'Final class updated successfully'));
});

export const updateClassStatus = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const { status, actualEndDate } = req.body;
  const cls = await updateFinalClassStatus(classId, status, actualEndDate);
  return res.json(successResponse(cls, 'Class status updated successfully'));
});

export const updateProgress = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const { completedSessions } = req.body;
  const cls = await updateSessionProgress(classId, completedSessions);
  return res.json(successResponse(cls, 'Session progress updated successfully'));
});

export const createOneTimeRescheduleController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const tutorUserId = req.user!.id;
  const { fromDate, toDate, timeSlot } = req.body as { fromDate?: string; toDate?: string; timeSlot?: string };

  if (!fromDate || !timeSlot) {
    throw new ErrorResponse('fromDate and timeSlot are required', 400);
  }

  const cls = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (String(cls.tutor) !== String(tutorUserId)) {
    throw new ErrorResponse('You are not the assigned tutor for this class', 403);
  }
  if (cls.status !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Only active classes can be rescheduled', 400);
  }

  let allowTutorReschedule = true;
  try {
    const coord = await Coordinator.findOne({ user: cls.coordinator as any });
    if (coord && (coord as any).settings?.attendanceControls) {
      const flag = (coord as any).settings.attendanceControls.allowTutorReschedule;
      if (typeof flag === 'boolean') allowTutorReschedule = flag;
    }
  } catch {}

  if (!allowTutorReschedule) {
    throw new ErrorResponse('Rescheduling is disabled by your coordinator', 403);
  }

  const normalize = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd.getTime();
  };

  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toDate || fromDate);
  to.setHours(0, 0, 0, 0);

  const list: any[] = ((cls as any).oneTimeReschedules || [])
    .map((r: any) => ({ ...r }))
    .filter((r: any) => r && r.fromDate && r.toDate && r.timeSlot);
  // Replace any existing reschedule for the same original date
  const filtered = list.filter((r) => normalize(new Date(r.fromDate)) !== normalize(from));
  filtered.push({ fromDate: from, toDate: to, timeSlot });
  (cls as any).oneTimeReschedules = filtered;

  await cls.save();
  return res.status(200).json(successResponse(cls, 'One-time reschedule saved'));
});

export const parentRequestRescheduleController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const parentUserId = req.user!.id;

  const cls = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);

  if (!cls.parent || String(cls.parent) !== String(parentUserId)) {
    throw new ErrorResponse('You are not authorized to reschedule this class', 403);
  }

  const tutorUserId = String(cls.tutor);
  const studentName = (cls as any).studentName || 'your child';

  // Create a GENERAL notification to the tutor about the parent reschedule request
  await createNotificationWithPreferences({
    recipient: tutorUserId,
    type: 'GENERAL',
    title: 'Parent requested to reschedule a class',
    message: `The parent has requested to reschedule the class for ${studentName}. Please contact the parent to coordinate a new time.`,
  });

  // Best-effort email notification to tutor
  try {
    const tutorUser = await User.findById(tutorUserId).select('email name');
    if (tutorUser && tutorUser.email) {
      const tutorName = (tutorUser as any).name || 'Tutor';
      await sendEmail(
        tutorUser.email,
        'Parent requested to reschedule a class',
        `<p>Dear ${tutorName},</p>
         <p>The parent has requested to reschedule the class for <strong>${studentName}</strong>.</p>
         <p>Please contact the parent to coordinate a new time that works for both of you.</p>
         <p>Regards,<br/>Your Shikshak</p>`
      );
    }
  } catch (e) {
    // Email failures should not block the parent request
    // eslint-disable-next-line no-console
    console.error('[parentRequestRescheduleController] Failed to send tutor email', e);
  }

  return res.status(200).json(successResponse(null, 'Reschedule request sent to tutor'));
});

export const getCoordinatorClasses = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.params.coordinatorId as string;
  const status = (req.query.status as string) || undefined;
  const classes = await getClassesByCoordinator(coordinatorUserId, status);
  return res.json(successResponse(classes));
});

export const getTutorClasses = asyncHandler(async (req: AuthRequest, res) => {
  const tutorUserId = req.params.tutorId as string;
  const status = (req.query.status as string) || undefined;
  const classes = await getClassesByTutor(tutorUserId, status);
  return res.json(successResponse(classes));
});

export const getMyClassesController = asyncHandler(async (req: AuthRequest, res) => {
  const status = (req.query.status as string) || FINAL_CLASS_STATUS.ACTIVE;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const classes = await getClassesByTutor(req.user!.id, status);

  const total = classes.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedClasses = classes.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedClasses, page, limit, total));
});

export const getParentClassesController = asyncHandler(async (req: AuthRequest, res) => {
  const status = (req.query.status as string) || FINAL_CLASS_STATUS.ACTIVE;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const classes = await getClassesByParent(req.user!.id, status);

  const total = classes.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedClasses = classes.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedClasses, page, limit, total));
});

export const changeTutorController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const { newTutorUserId, reason } = req.body;
  const changedBy = req.user!.id;

  const result = await changeTutor({
    classId,
    newTutorUserId,
    reason,
    changedBy,
  });

  return res.status(200).json(successResponse(result, 'Tutor changed successfully'));
});

export const tutorLeavingController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const { reason } = req.body;
  const changedBy = req.user!.id;

  const result = await handleTutorLeaving({
    classId,
    reason,
    changedBy,
  });

  return res.status(200).json(successResponse(result, 'Tutor departure recorded successfully'));
});

export const repostLeadController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const createdBy = req.user!.id;

  const result = await repostClassAsLead({
    classId,
    createdBy,
  });

  return res.status(201).json(successResponse(result, 'Class reposted as lead successfully'));
});

export default {
  convertToFinalClass,
  getFinalClasses,
  getFinalClass,
  updateFinalClassDetails,
  updateClassStatus,
  updateProgress,
  getCoordinatorClasses,
  getTutorClasses,
  getMyClassesController,
  getParentClassesController,
  createOneTimeRescheduleController,
  parentRequestRescheduleController,
  changeTutorController,
  tutorLeavingController,
  repostLeadController,
};
