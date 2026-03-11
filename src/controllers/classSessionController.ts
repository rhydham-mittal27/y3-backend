import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import FinalClass from '../models/FinalClass';
import { USER_ROLES } from '../config/constants';
import { generateClassSessionsForCycle, getTutorSessionsForCycle } from '../services/classSessionService';
import { AuthRequest } from '../types';

export const getMyTutorSessionsForCycleController = asyncHandler(async (req: AuthRequest, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const ensure = String(req.query.ensure || '').toLowerCase() === 'true';
  if (!month || !year) throw new ErrorResponse('month and year are required', 400);

  if (ensure) {
    const classes = await FinalClass.find({ tutor: req.user!.id, status: 'ACTIVE' }).select(
      '_id schedule classesPerMonth tutor coordinator'
    );

    let attempted = 0;
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const cls of classes) {
      const classId = String((cls as any)._id);
      try {
        const sched: any = (cls as any).schedule || {};
        const hasSchedule =
          sched &&
          Array.isArray(sched.daysOfWeek) &&
          sched.daysOfWeek.length > 0 &&
          Boolean(String(sched.timeSlot || '').trim());

        const n = Number((cls as any).classesPerMonth || 0);
        const hasMonthlyCount = Number.isFinite(n) && n > 0;

        if (!hasSchedule || !hasMonthlyCount) {
          skipped += 1;
          continue;
        }

        attempted += 1;
        await generateClassSessionsForCycle({
          classId,
          cycleMonth: month,
          cycleYear: year,
          actorUserId: req.user!.id,
        });
        generated += 1;
      } catch (err: any) {
        failed += 1;
        const message = err?.message || String(err);
        console.warn('[class-sessions][ensure] generation failed', { classId, month, year, message });
      }
    }

    console.log('[class-sessions][ensure] summary', {
      tutorId: req.user!.id,
      month,
      year,
      totalClasses: classes.length,
      skipped,
      attempted,
      generated,
      failed,
    });
  }

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
