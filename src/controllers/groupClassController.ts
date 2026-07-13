import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { renewGroupClassForCoordinator } from '../services/groupClassService';

export const renewGroupClassController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const groupClassId = req.params.id as string;
  const coordinatorUserId = req.user!.id;
  const attendanceSheetId = (req.body as any)?.attendanceSheetId;

  const sessionsPerMonthRaw = (req.body as any)?.sessionsPerMonth;
  const tutorRatePerSessionRaw = (req.body as any)?.tutorRatePerSession;

  const plan =
    typeof sessionsPerMonthRaw !== 'undefined'
      ? {
          sessionsPerMonth: Number(sessionsPerMonthRaw),
          tutorRatePerSession:
            typeof tutorRatePerSessionRaw !== 'undefined' ? Number(tutorRatePerSessionRaw) : undefined,
        }
      : undefined;

  const result = await renewGroupClassForCoordinator({ groupClassId, coordinatorUserId, attendanceSheetId, plan });

  return res.status(200).json(successResponse(result, 'Group class renewed successfully'));
});
