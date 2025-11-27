import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { USER_ROLES } from '../config/constants';
import PDFDocument from 'pdfkit';
import {
  scheduleTest,
  getAllTests,
  getTestById,
  getTestsByClass,
  updateTestStatus,
  submitTestReport,
  updateTest,
  cancelTest,
  deleteTest,
  getTestsForCoordinator,
  getTestsByParent,
} from '../services/testService';

export const scheduleTestController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { finalClassId, testDate, testTime, notes } = req.body as any;
  const scheduledBy = req.user!.id;
  const test = await scheduleTest({ finalClassId, testDate, testTime, notes, scheduledBy });
  return res.status(201).json(successResponse(test, 'Test scheduled successfully'));
});

export const getTests = asyncHandler(async (req: AuthRequest, res) => {
  const { page = '1', limit = '10', finalClassId, status, tutorId, coordinatorId, fromDate, toDate, sortBy, sortOrder } =
    req.query as any;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const from = fromDate ? new Date(fromDate) : undefined;
  const to = toDate ? new Date(toDate) : undefined;

  // Tutors should only see their own tests regardless of the query string
  const callerRole = req.user?.role;
  const callerId = req.user?.id;
  const effectiveTutorId = callerRole === USER_ROLES.TUTOR ? callerId : (tutorId as string | undefined);

  const { tests, total } = await getAllTests({
    page: pageNum,
    limit: limitNum,
    finalClassId: finalClassId as string,
    status: status as any,
    tutorId: effectiveTutorId,
    coordinatorId: coordinatorId as string,
    fromDate: from,
    toDate: to,
    sortBy: sortBy as string,
    sortOrder: (sortOrder as any) || 'desc',
  });

  return res.json(paginatedResponse(tests as any, pageNum, limitNum, total));
});

export const getTest = asyncHandler(async (req, res) => {
  const { id } = req.params as any;
  const test = await getTestById(id);
  return res.json(successResponse(test));
});

export const getClassTests = asyncHandler(async (req, res) => {
  const { classId } = req.params as any;
  const { status } = req.query as any;
  const tests = await getTestsByClass(classId, status as any);
  return res.json(successResponse(tests));
});

export const updateTestStatusController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const { status } = req.body as any;
  const userId = req.user!.id;
  const test = await updateTestStatus(id, status, userId);
  return res.json(successResponse(test, 'Test status updated successfully'));
});

export const submitTestReportController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const { report } = req.body as any;
  const tutorUserId = req.user!.id;
  const test = await submitTestReport(id, report, tutorUserId);
  return res.json(successResponse(test, 'Test report submitted successfully'));
});

export const updateTestController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const updateData = req.body as any;
  const coordinatorUserId = req.user!.id;
  const test = await updateTest(id, updateData, coordinatorUserId);
  return res.json(successResponse(test, 'Test updated successfully'));
});

export const cancelTestController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as any;
  const { cancellationReason } = req.body as any;
  const coordinatorUserId = req.user!.id;
  const test = await cancelTest(id, cancellationReason, coordinatorUserId);
  return res.json(successResponse(test, 'Test cancelled successfully'));
});

export const deleteTestController = asyncHandler(async (req, res) => {
  const { id } = req.params as any;
  const result = await deleteTest(id);
  return res.json(successResponse(result, 'Test deleted successfully'));
});

export const getCoordinatorTests = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.user!.id;
  const { status } = req.query as any;
  const tests = await getTestsForCoordinator(coordinatorUserId, status as any);
  return res.json(successResponse(tests));
});

export const getMyTestsForParent = asyncHandler(async (req: AuthRequest, res) => {
  const parentUserId = req.user!.id;
  const { status } = req.query as any;
  const tests = await getTestsByParent(parentUserId, status as any);
  return res.json(successResponse(tests));
});

export const exportTestReportPDF = asyncHandler(async (req, res) => {
  const { id } = req.params as any;
  const test: any = await getTestById(id);
  if (!test) {
    throw new ErrorResponse('Test not found', 404);
  }
  if (!test.report) {
    throw new ErrorResponse('Test report not yet submitted', 400);
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=test-report-${id}-${Date.now()}.pdf`);
  doc.pipe(res);

  // Title
  doc.fontSize(20).text('Test Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text('Your Shikshak - Student Assessment Report', { align: 'center' });
  doc.moveDown(2);

  // Test Details
  doc.fontSize(14).text('Test Details', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Test Date: ${new Date(test.testDate).toDateString()}`);
  doc.text(`Test Time: ${test.testTime}`);
  doc.text(`Student: ${test.finalClass?.studentName}`);
  doc.text(`Grade: ${test.finalClass?.grade}`);
  doc.text(`Subjects: ${(test.finalClass?.subject || []).join(', ')}`);
  doc.text(`Tutor: ${test.tutor?.name}`);
  doc.moveDown(1.5);

  // Report Sections
  doc.fontSize(12).text('Overall Feedback', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(test.report.feedback || '-', { align: 'justify' });
  doc.moveDown(1);

  doc.fontSize(12).text('Student Strengths', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(test.report.strengths || '-', { align: 'justify' });
  doc.moveDown(1);

  doc.fontSize(12).text('Areas of Improvement', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(test.report.areasOfImprovement || '-', { align: 'justify' });
  doc.moveDown(1);

  doc.fontSize(12).text('Student Performance Assessment', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(test.report.studentPerformance || '-', { align: 'justify' });
  doc.moveDown(1);

  doc.fontSize(12).text('Recommendations', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(test.report.recommendations || '-', { align: 'justify' });
  doc.moveDown(1);

  // Metadata
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(9).text(`Report Submitted By: ${test.reportSubmittedBy?.name || '-'}`, { align: 'right' });
  doc.text(`Submitted At: ${test.reportSubmittedAt ? new Date(test.reportSubmittedAt).toLocaleString() : '-'}`, { align: 'right' });
  doc.text(`Generated At: ${new Date().toLocaleString()}`, { align: 'right' });

  doc.end();
});

export default {
  scheduleTestController,
  getTests,
  getTest,
  getClassTests,
  updateTestStatusController,
  submitTestReportController,
  updateTestController,
  cancelTestController,
  deleteTestController,
  getCoordinatorTests,
  exportTestReportPDF,
  getMyTestsForParent,
};
