import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { USER_ROLES } from '../config/constants';
import PDFDocument from 'pdfkit';
import path from 'path';
import {
  getAllAttendance,
  getAttendanceById,

  deleteAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
  getTutorAttendanceSummary,
} from '../services/attendanceService';
import { addDailyAttendance, updateDailyAttendance } from '../services/attendanceSheetService';

export const createAttendanceRecord = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { finalClassId, sessionDate, durationHours, topicCovered, notes, studentAttendanceStatus } = req.body as any;
  const submittedBy = req.user!.id;

  const sheet = await addDailyAttendance({
    finalClassId,
    sessionDate,
    durationHours,
    topicCovered,
    notes,
    studentAttendanceStatus,
    userId: submittedBy,
  });

  return res.status(201).json(successResponse(sheet, 'Attendance record created successfully'));
});

// ... (getAttendances etc)

export const updateAttendanceRecord = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const updateData = req.body as any;
  
  const record = await updateDailyAttendance(id, updateData);
  
  return res.json(successResponse(record, 'Attendance updated successfully'));
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

export const coordinatorApproveAttendance = asyncHandler(async (_req: AuthRequest, _res) => {
  throw new ErrorResponse('Individual attendance verification is deprecated. Please verify the monthly attendance sheet.', 400);
});

export const parentApproveAttendance = asyncHandler(async (_req: AuthRequest, _res) => {
  throw new ErrorResponse('Individual attendance verification is deprecated. Please verify the monthly attendance sheet.', 400);
});

export const rejectAttendanceRecord = asyncHandler(async (_req: AuthRequest, _res) => {
  throw new ErrorResponse('Individual attendance verification is deprecated. Please verify the monthly attendance sheet.', 400);
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

export const getCoordinatorPendingApprovals = asyncHandler(async (_req: AuthRequest, res) => {
  // Return empty list as individual approvals are deprecated
  return res.json(successResponse([]));
});

export const getParentPendingApprovals = asyncHandler(async (_req: AuthRequest, res) => {
  // Return empty list as individual approvals are deprecated
  return res.json(successResponse([]));
});

export const getTutorAttendanceSummaryController = asyncHandler(async (req: AuthRequest, res) => {
  const tutorUserId = req.user!.id;
  const summary = await getTutorAttendanceSummary(tutorUserId);
  return res.json(successResponse(summary));
});

export const exportClassAttendancePdfController = asyncHandler(async (req: AuthRequest, res) => {
  const { classId } = req.params as any;
  const { start, end } = req.query as any;

  let attendances = await getAttendanceByClass(classId);
  if (!attendances.length) {
    throw new ErrorResponse('No attendance records found for this class', 404);
  }

  // Optional date range filter similar to YS trial monthly sheets (using sessionDate)
  if (start || end) {
    const from = start ? new Date(start) : undefined;
    const to = end ? new Date(end) : undefined;
    attendances = attendances.filter((a: any) => {
      if (!a.sessionDate) return false;
      const d = new Date(a.sessionDate);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  const doc = new PDFDocument({ margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${classId}.pdf`);
  doc.pipe(res as any);

  const first = attendances[0] as any;
  const studentName = first?.finalClass?.studentName || '';
  const className = first?.finalClass?.className || '';
  const subjects = Array.isArray(first?.finalClass?.subject)
    ? (first.finalClass.subject as string[]).join(', ')
    : (first?.finalClass?.subject as string) || '';

  // Header band similar to template
  const pageWidth = doc.page.width;
  const headerHeight = 40;
  doc.rect(0, 0, pageWidth, headerHeight).fill('#0F172A'); // slate-900 style background
  // Logo from frontend/public/1.jpg (one level up from backend and into frontend/public)
  try {
    const logoPath = path.resolve(__dirname, '../../../frontend/public/1.jpg');
    doc.image(logoPath, 36, 8, { fit: [22, 22] });
  } catch {
    // if logo missing, continue without breaking PDF generation
  }

  doc.fillColor('#FFFFFF').fontSize(14);
  doc.text('Your Shikshak – Home Tuition Attendance Sheet', 70, 14, { align: 'left' });
  doc.fontSize(9).fillColor('#E5E7EB');
  doc.text('Your Learning Partner', 40, 26, { align: 'left' });
  doc.moveDown();
  doc.moveTo(36, headerHeight).lineTo(pageWidth - 36, headerHeight).strokeColor('#E5E7EB').stroke();
  doc.strokeColor('#000000');
  doc.y = headerHeight + 12;

  // Class & student info
  doc.fontSize(10).fillColor('#111827');
  doc.text(`Class: ${className}`, { continued: true }).text(`   Student: ${studentName}`);
  if (subjects) {
    doc.text(`Subject(s): ${subjects}`);
  }
  if (start || end) {
    doc.text(`Period: ${start || '—'} to ${end || '—'}`);
  }
  doc.moveDown();

  // Table header
  const colDate = 40;
  const colDuration = 110;
  const colTopic = 170;
  const colStatus = 310;
  const colRemarks = 390;

  const drawHeader = () => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
    const headerY = doc.y;
    doc.rect(colDate - 2, headerY - 4, 530 - colDate, 16).fill('#E5E7EB');
    doc.fillColor('#111827');
    doc.text('Date', colDate, headerY, { width: 60 });
    doc.text('Duration', colDuration, headerY, { width: 50 });
    doc.text('Topic / Chapter', colTopic, headerY, { width: 130 });
    doc.text('Status', colStatus, headerY, { width: 70 });
    doc.text('Remarks', colRemarks, headerY, { width: 130 });
    doc.moveDown(1.2);
    doc.moveTo(colDate - 2, doc.y).lineTo(530, doc.y).strokeColor('#9CA3AF').stroke();
    doc.strokeColor('#000000');
  };

  drawHeader();
  doc.font('Helvetica');

  attendances.forEach((a: any, index: number) => {
    const d = a.sessionDate ? new Date(a.sessionDate) : null;
    const dateStr = d ? d.toLocaleDateString('en-IN') : '';
    const durationMins = a.durationMinutes || (a.durationHours ? Math.round(a.durationHours * 60) : '-');
    const topic = a.topicCovered || '';
    const status = String(a.studentAttendanceStatus || '');
    const remarks = a.notes || '';

    const rowTop = doc.y;
    // Calculate max height for this row based on content wrapping
    const topicHeight = doc.heightOfString(topic, { width: 130 });
    const remarksHeight = doc.heightOfString(remarks, { width: 130 });
    const rowHeight = Math.max(14, topicHeight, remarksHeight);

    // Zebra striping with light blue/gray
    if (index % 2 === 0) {
      doc.rect(colDate - 2, rowTop - 2, 530 - colDate, rowHeight + 4)
        .fillOpacity(0.04)
        .fill('#3B82F6')
        .fillOpacity(1);
    }

    doc.fontSize(9).fillColor('#111827');
    doc.text(dateStr, colDate + 2, rowTop, { width: 60 });
    doc.text(String(durationMins), colDuration + 2, rowTop, { width: 50 });
    doc.text(topic, colTopic + 2, rowTop, { width: 130 });
    doc.text(status, colStatus + 2, rowTop, { width: 70 });
    doc.text(remarks, colRemarks + 2, rowTop, { width: 130 });
    doc.moveDown();
    // Ensure we move down enough if text wrapped
    if (rowHeight > 14) {
       doc.y = rowTop + rowHeight + 4; 
    }

    // New page if close to bottom
    if (doc.y > doc.page.height - 60 && index !== attendances.length - 1) {
      doc.addPage();
      doc.y = headerHeight + 12;
      drawHeader();
    }
  });

  // Footer lines for total hours / remarks / signature, similar to template
  doc.moveDown(2);
  const footerY = doc.y;
  doc.fontSize(9).fillColor('#111827');
  doc.text('Total Teaching Hours: __________________________', colDate, footerY);
  doc.moveDown(0.7);
  doc.text('Tutor’s General Remarks: _____________________________________________', colDate);
  doc.moveDown(1);
  doc.text('Parent’s Final Signature: __________________________', colDate, doc.y, { continued: true });
  doc.text('Date: ___ / ___ / ___', colStatus, doc.y);

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
