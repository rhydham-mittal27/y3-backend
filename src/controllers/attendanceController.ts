import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { USER_ROLES } from '../config/constants';
import PDFDocument from 'pdfkit';
import {
  createAttendance,
  getAllAttendance,
  getAttendanceById,
  coordinatorApprove,
  parentApprove,
  rejectAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
  getPendingApprovalsForCoordinator,
  getPendingApprovalsForParent,
  getTutorAttendanceSummary,
} from '../services/attendanceService';

export const createAttendanceRecord = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { finalClassId, sessionDate, sessionNumber, notes, studentAttendanceStatus } = req.body as any;
  const submittedBy = req.user!.id;
  const attendance = await createAttendance({
    finalClassId,
    sessionDate,
    sessionNumber,
    notes,
    studentAttendanceStatus,
    submittedBy,
  });
  return res.status(201).json(successResponse(attendance, 'Attendance record created successfully'));
});

export const getAttendances = asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '10',
    finalClassId,
    status,
    tutorId,
    coordinatorId,
    parentId,
    fromDate,
    toDate,
    sortBy,
    sortOrder,
  } = req.query as any;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  const from = fromDate ? new Date(fromDate) : undefined;
  const to = toDate ? new Date(toDate) : undefined;

  const authReq = req as AuthRequest;
  let effectiveTutorId = tutorId as string;

  if (authReq.user && authReq.user.role === USER_ROLES.TUTOR) {
    effectiveTutorId = authReq.user.id;
  }

  const { attendances, total } = await getAllAttendance({
    page: pageNum,
    limit: limitNum,
    finalClassId: finalClassId as string,
    status: status as any,
    tutorId: effectiveTutorId,
    coordinatorId: coordinatorId as string,
    parentId: parentId as string,
    fromDate: from,
    toDate: to,
    sortBy: sortBy as string,
    sortOrder: (sortOrder as any) || 'desc',
  });

  return res.json(paginatedResponse(attendances as any, pageNum, limitNum, total));
});

export const getAttendance = asyncHandler(async (req, res) => {
  const { id } = req.params as any;
  const attendance = await getAttendanceById(id);
  return res.json(successResponse(attendance));
});

export const coordinatorApproveAttendance = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const coordinatorUserId = req.user!.id;
  const attendance = await coordinatorApprove(id, coordinatorUserId);
  return res.json(successResponse(attendance, 'Attendance approved by coordinator'));
});

export const parentApproveAttendance = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const parentUserId = req.user!.id;
  const attendance = await parentApprove(id, parentUserId);
  return res.json(successResponse(attendance, 'Attendance approved by parent'));
});

export const rejectAttendanceRecord = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const { rejectionReason } = req.body as any;
  const rejectedByUserId = req.user!.id;
  const attendance = await rejectAttendance(id, rejectedByUserId, rejectionReason);
  return res.json(successResponse(attendance, 'Attendance rejected'));
});

export const updateAttendanceRecord = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const updateData = req.body as any;
  const attendance = await updateAttendance(id, updateData);
  return res.json(successResponse(attendance, 'Attendance updated successfully'));
});

export const deleteAttendanceRecord = asyncHandler(async (req, res) => {
  const { id } = req.params as any;
  const result = await deleteAttendance(id);
  return res.json(successResponse(result, 'Attendance deleted successfully'));
});

export const getClassAttendance = asyncHandler(async (req, res) => {
  const { classId } = req.params as any;
  const { status } = req.query as any;
  const attendances = await getAttendanceByClass(classId, status as any);
  return res.json(successResponse(attendances));
});

export const getClassAttendanceHistory = asyncHandler(async (req, res) => {
  const { classId } = req.params as any;
  const data = await getAttendanceHistory(classId);
  return res.json(successResponse(data));
});

export const getCoordinatorPendingApprovals = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.user!.id;
  const attendances = await getPendingApprovalsForCoordinator(coordinatorUserId);
  return res.json(successResponse(attendances));
});

export const getParentPendingApprovals = asyncHandler(async (req: AuthRequest, res) => {
  const parentUserId = req.user!.id;
  const attendances = await getPendingApprovalsForParent(parentUserId);
  return res.json(successResponse(attendances));
});

export const getTutorAttendanceSummaryController = asyncHandler(async (req: AuthRequest, res) => {
  const tutorUserId = req.user!.id;
  const summary = await getTutorAttendanceSummary(tutorUserId);
  return res.json(successResponse(summary));
});

export const exportClassAttendancePdfController = asyncHandler(async (req: AuthRequest, res) => {
  const { classId } = req.params as any;

  const attendances = await getAttendanceByClass(classId);
  if (!attendances.length) {
    throw new ErrorResponse('No attendance records found for this class', 404);
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${classId}.pdf`);
  doc.pipe(res as any);

  const first = attendances[0] as any;
  const studentName = first?.finalClass?.studentName || '';
  const className = first?.finalClass?.className || '';

  doc.fontSize(18).text('Attendance Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Class: ${className}`);
  doc.text(`Student: ${studentName}`);
  doc.moveDown();

  doc.fontSize(12).text('Date', { continued: true, width: 150 });
  doc.text('Status', { width: 150 });
  doc.moveDown(0.5);

  attendances.forEach((a: any) => {
    const d = a.sessionDate ? new Date(a.sessionDate).toDateString() : '';
    doc.text(d, { continued: true, width: 150 });
    doc.text(String(a.studentAttendanceStatus || ''), { width: 150 });
  });

  doc.end();
});

export default {
  createAttendanceRecord,
  getAttendances,
  getAttendance,
  coordinatorApproveAttendance,
  parentApproveAttendance,
  rejectAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  getClassAttendance,
  getClassAttendanceHistory,
  getCoordinatorPendingApprovals,
  getParentPendingApprovals,
  getTutorAttendanceSummaryController,
  exportClassAttendancePdfController,
};
