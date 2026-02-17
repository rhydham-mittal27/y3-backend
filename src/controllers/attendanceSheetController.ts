import { Response } from 'express';
import { USER_ROLES } from '../config/constants';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  addDailyAttendance,
  submitAttendanceSheet,
  getCoordinatorPendingSheets,
  getAllPendingSheets,
  approveAttendanceSheet,
  rejectAttendanceSheet,
  getSheetsForClass,
} from '../services/attendanceSheetService';

export const addDailyAttendanceController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { finalClassId, sessionDate, durationHours, topicCovered, studentAttendanceStatus, notes } = req.body as any;
  
  if (!finalClassId || !sessionDate) {
    throw new ErrorResponse('finalClassId and sessionDate are required', 400);
  }

  const sheet = await addDailyAttendance({
    finalClassId,
    sessionDate,
    durationHours,
    topicCovered,
    studentAttendanceStatus,
    notes,
    userId: req.user!.id,
  });

  return res.status(201).json(successResponse(sheet, 'Attendance recorded successfully'));
});

export const getSheetsForClassController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { classId } = req.params as any;
  const { month, year } = req.query as any;
  const sheets = await getSheetsForClass(classId, month ? Number(month) : undefined, year ? Number(year) : undefined);
  return res.json(successResponse(sheets));
});

export const submitAttendanceSheetController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const sheet = await submitAttendanceSheet(id, req.user!.id);
  return res.json(successResponse(sheet, 'Attendance sheet submitted to coordinator'));
});

export const getCoordinatorPendingSheetsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const coordinatorUserId = req.user!.id;
  const sheets = await getCoordinatorPendingSheets(coordinatorUserId);
  return res.json(successResponse(sheets));
});

export const getAllPendingSheetsController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const sheets = await getAllPendingSheets();
  return res.json(successResponse(sheets));
});

export const approveAttendanceSheetController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const isAdmin = req.user!.role === USER_ROLES.ADMIN;
  const sheet = await approveAttendanceSheet(id, req.user!.id, isAdmin);
  return res.json(successResponse(sheet, 'Attendance sheet approved'));
});

export const rejectAttendanceSheetController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const { rejectionReason } = req.body as any;
  if (!rejectionReason || String(rejectionReason).trim().length === 0) {
    throw new ErrorResponse('rejectionReason is required', 400);
  }
  const isAdmin = req.user!.role === USER_ROLES.ADMIN;
  const sheet = await rejectAttendanceSheet(id, req.user!.id, rejectionReason, isAdmin);
  return res.json(successResponse(sheet, 'Attendance sheet rejected'));
});

export default {
  addDailyAttendanceController,
  getSheetsForClassController,
  submitAttendanceSheetController,
  getCoordinatorPendingSheetsController,
  getAllPendingSheetsController,
  approveAttendanceSheetController,
  rejectAttendanceSheetController,
};
