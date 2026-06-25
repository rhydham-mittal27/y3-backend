import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import FinalClass from '../models/FinalClass';
import { USER_ROLES } from '../config/constants';
import { generateClassSessionsForCycle, getTutorSessionsForCycle, getCoordinatorSessionsForCycle, rescheduleSession } from '../services/classSessionService';
import { AuthRequest } from '../types';

export const getMyTutorSessionsForCycleController = asyncHandler(async (req: AuthRequest, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!month || !year) throw new ErrorResponse('month and year are required', 400);
  // `ensure` param is intentionally ignored — sessions are generated on first attendance,
  // not on every timetable fetch.

  const sessions = await getTutorSessionsForCycle({
    tutorUserId: req.user!.id,
    cycleMonth: month,
    cycleYear: year,
  });

  return res.json(successResponse(sessions));
});

export const generateSessionsForClassCycleController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const classId = req.params.classId as string;
  const { month, year } = req.body as { month?: number; year?: number };
  if (!month || !year) throw new ErrorResponse('month and year are required', 400);

  const cls = await FinalClass.findById(classId).select('tutor coordinator');
  if (!cls) throw new ErrorResponse('Final class not found', 404);

  const role = req.user?.role;
  const isTutorOwner = String((cls as any).tutor) === String(req.user!.id);
  const isCoordinatorOwner = (cls as any).coordinator && String((cls as any).coordinator) === String(req.user!.id);

  const allowed =
    role === USER_ROLES.ADMIN ||
    role === USER_ROLES.MANAGER ||
    (role === USER_ROLES.TUTOR && isTutorOwner) ||
    (role === USER_ROLES.COORDINATOR && isCoordinatorOwner);

  if (!allowed) throw new ErrorResponse('Not authorized to generate sessions for this class', 403);

  const sessions = await generateClassSessionsForCycle({
    classId,
    cycleMonth: Number(month),
    cycleYear: Number(year),
    actorUserId: req.user!.id,
  });

  return res.json(successResponse(sessions, 'Sessions generated'));
});

export const getMyCoordinatorSessionsForCycleController = asyncHandler(async (req: AuthRequest, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!month || !year) throw new ErrorResponse('month and year are required', 400);
  // `ensure` param ignored — sessions generated on tutor cycle-start, not on fetch.

  const sessions = await getCoordinatorSessionsForCycle({
    coordinatorUserId: req.user!.id,
    cycleMonth: month,
    cycleYear: year,
  });

  return res.json(successResponse(sessions));
});

export const getClassSessionsController = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.classId;
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!classId || !month || !year) {
    throw new ErrorResponse('classId, month and year are required', 400);
  }

  const cls = await FinalClass.findById(classId).select('tutor coordinator status');
  let classEntity = cls;
  if (!classEntity) {
    const GroupClass = (await import('../models/GroupClass')).default;
    classEntity = await GroupClass.findById(classId) as any;
  }
  if (!classEntity) throw new ErrorResponse('Class not found', 404);

  const isAdmin = req.user?.role === USER_ROLES.ADMIN;
  const isManager = req.user?.role === USER_ROLES.MANAGER;
  const isTutor = req.user?.role === USER_ROLES.TUTOR && String(classEntity.tutor) === String(req.user!.id);
  const isCoord = req.user?.role === USER_ROLES.COORDINATOR && String(classEntity.coordinator) === String(req.user!.id);

  if (!isAdmin && !isManager && !isTutor && !isCoord) {
    throw new ErrorResponse('Not authorized to view sessions for this class', 403);
  }

  const sessions = await import('../services/classSessionService').then(s => s.getClassSessionsForCycle({
    classId,
    cycleMonth: month,
    cycleYear: year,
  }));

  return res.json(successResponse(sessions));
});

export const rescheduleSessionController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const { sessionId } = req.params;
  const { newDate, newTimeSlot } = req.body as { newDate: string; newTimeSlot?: string };

  if (!newDate) throw new ErrorResponse('newDate is required', 400);

  const isAdmin =
    req.user?.role === USER_ROLES.ADMIN || req.user?.role === USER_ROLES.MANAGER;

  const session = await rescheduleSession({
    sessionId,
    newDate: new Date(newDate),
    newTimeSlot,
    actorUserId: req.user!.id,
    isAdmin,
  });

  return res.json(successResponse(session, 'Session rescheduled'));
});
