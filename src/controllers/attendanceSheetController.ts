import { Response } from 'express';
import { USER_ROLES } from '../config/constants';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  upsertAttendanceSheet,
  submitAttendanceSheet,
  getCoordinatorPendingSheets,
  getAllPendingSheets,
  approveAttendanceSheet,
  rejectAttendanceSheet,
} from '../services/attendanceSheetService';

export const upsertAttendanceSheetController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { finalClassId, month, year } = req.body as any;
  if (!finalClassId || !month || !year) {
    throw new ErrorResponse('finalClassId, month, and year are required', 400);
  }

  const sheet = await upsertAttendanceSheet({
    finalClassId,
    month: Number(month),
    year: Number(year),
    createdByUserId: req.user!.id,
  });

  return res.status(201).json(successResponse(sheet, 'Attendance sheet generated/updated successfully'));
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
  upsertAttendanceSheetController,
  submitAttendanceSheetController,
  getCoordinatorPendingSheetsController,
  getAllPendingSheetsController,
  approveAttendanceSheetController,
  rejectAttendanceSheetController,
};
