import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { Parser as Json2CsvParser } from 'json2csv';
import PDFDocument from 'pdfkit';
import {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  updatePayment,
  deletePayment,
  getPaymentsByTutor,
  getPaymentsByClass,
  getPaymentStatistics,
  generatePaymentReport,
  sendPaymentReminder,
  getPaymentsByParent,
  createAdvancePaymentForFinalClass,
} from '../services/paymentService';

export const createPaymentRecord = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse('Validation error', 400);

  const { attendanceId } = req.body as { attendanceId: string };
  const createdBy = req.user!.id;
  const payment = await createPayment(attendanceId, createdBy);
  return res.status(201).json(successResponse(payment, 'Payment created successfully'));
});

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10', status, tutorId, finalClassId, fromDate, toDate, sortBy, sortOrder } = req.query as any;
  const result = await getAllPayments({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    status: status as any,
    tutorId: tutorId as string | undefined,
    finalClassId: finalClassId as string | undefined,
    fromDate: fromDate ? new Date(fromDate as string) : undefined,
    toDate: toDate ? new Date(toDate as string) : undefined,
    sortBy: sortBy as string | undefined,
    sortOrder: (sortOrder as any) || 'desc',
  });
  return res.json(paginatedResponse(result.payments, result.page, result.limit, result.total));
});

export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await getPaymentById(req.params.id);
  return res.json(successResponse(payment));
});

export const updatePaymentStatusController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validation errors:', errors.array());
    throw new ErrorResponse(`Validation error: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { status, paymentMethod, transactionId, notes } = req.body as any;
  
  // Log the incoming request data for debugging
  console.log('Updating payment status with:', {
    paymentId: req.params.id,
    status,
    paymentMethod,
    transactionId,
    notes,
    userId: req.user?.id
  });
  
  const payment = await updatePaymentStatus(
    req.params.id, 
    status, 
    paymentMethod, 
    transactionId, 
    notes, 
    req.user!.id,
    req.user // Pass the current user for authorization
  );
  return res.json(successResponse(payment, 'Payment status updated successfully'));
});

export const updatePaymentRecord = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse('Validation error', 400);

  const payment = await updatePayment(req.params.id, req.body);
  return res.json(successResponse(payment, 'Payment updated successfully'));
});

export const deletePaymentRecord = asyncHandler(async (req: Request, res: Response) => {
  const result = await deletePayment(req.params.id);
  return res.json(successResponse(result, 'Payment deleted successfully'));
});

export const getTutorPayments = asyncHandler(async (req: Request, res: Response) => {
  const { status, fromDate, toDate } = req.query as any;
  const result = await getPaymentsByTutor(
    req.params.tutorId,
    status as any,
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined
  );
  return res.json(successResponse(result));
});

export const getMyPaymentsForParent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, fromDate, toDate } = req.query as any;
  const result = await getPaymentsByParent(
    req.user!.id,
    status as any,
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined
  );
  return res.json(successResponse(result));
});

export const getMyPaymentSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, fromDate, toDate } = req.query as any;
  const result = await getPaymentsByTutor(
    req.user!.id,
    status as any,
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined
  );
  return res.json(successResponse(result));
});

export const getClassPayments = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as any;
  const result = await getPaymentsByClass(req.params.classId, status as any);
  return res.json(successResponse(result));
});

export const generateAdvancePaymentForClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId as string;
  const createdBy = req.user!.id;
  const payment = await createAdvancePaymentForFinalClass(classId, createdBy);
  return res.status(201).json(successResponse(payment, 'Advance payment created successfully'));
});

export const getPaymentStats = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate, tutorId } = req.query as any;
  const stats = await getPaymentStatistics(
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined,
    tutorId as string | undefined
  );
  return res.json(successResponse(stats));
});

export const exportPaymentsCSV = asyncHandler(async (req: Request, res: Response) => {
  const { tutorId, finalClassId, status, fromDate, toDate } = req.query as any;
  const data = await generatePaymentReport({
    tutorId,
    finalClassId,
    status,
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
  });
  const parser = new Json2CsvParser({});
  const csv = parser.parse(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=payments-report.csv');
  return res.send(csv);
});

export const exportPaymentsPDF = asyncHandler(async (req: Request, res: Response) => {
  const { tutorId, finalClassId, status, fromDate, toDate } = req.query as any;
  const data = await generatePaymentReport({
    tutorId,
    finalClassId,
    status,
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
  });

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=payments-report.pdf');
  doc.pipe(res);

  doc.fontSize(18).text('Payments Report', { align: 'center' });
  doc.moveDown();

  // Headers
  doc.fontSize(12).text('ID', { continued: true, width: 120 });
  doc.text('Tutor', { continued: true, width: 140 });
  doc.text('Amount', { continued: true, width: 80 });
  doc.text('Status', { continued: true, width: 80 });
  doc.text('Due Date', { width: 120 });
  doc.moveDown(0.5);

  data.forEach((row) => {
    doc.text(row.id, { continued: true, width: 120 });
    doc.text(row.tutorName || '', { continued: true, width: 140 });
    doc.text(`${row.currency} ${row.amount}`, { continued: true, width: 80 });
    doc.text(row.status, { continued: true, width: 80 });
    doc.text(row.dueDate ? new Date(row.dueDate).toDateString() : '', { width: 120 });
  });

  doc.end();
});

export const downloadPaymentReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payment = await getPaymentById(req.params.id);
  if (!payment) throw new ErrorResponse('Payment not found', 404);
  // Ensure the authenticated tutor is the owner of this payment
  const tutorId = (payment as any).tutor?._id || (payment as any).tutor?.id || (payment as any).tutor;
  if (String(tutorId) !== req.user!.id) throw new ErrorResponse('Unauthorized', 403);

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=payment-receipt-${(payment as any)._id}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).text('Payment Receipt', { align: 'center' });
  doc.moveDown();

  // Payment details
  const amount = (payment as any).amount;
  const currency = (payment as any).currency || 'INR';
  const status = (payment as any).status;
  const paymentDate = (payment as any).paymentDate || (payment as any).createdAt;
  doc.fontSize(12);
  doc.text(`Receipt ID: ${(payment as any)._id}`);
  doc.text(`Payment Date: ${paymentDate ? new Date(paymentDate).toDateString() : '-'}`);
  doc.text(`Status: ${status}`);
  doc.text(`Amount: ${currency} ${amount}`);
  doc.moveDown();

  // Class details
  const finalClass = (payment as any).finalClass || {};
  const subjects = Array.isArray(finalClass.subject) ? finalClass.subject.join(', ') : (finalClass.subject || '');
  doc.text('Class Details', { underline: true });
  doc.text(`Student: ${finalClass.studentName || '-'}`);
  doc.text(`Subject: ${subjects || '-'}`);
  doc.text(`Grade: ${finalClass.grade || '-'}`);
  doc.text(`Board: ${finalClass.board || '-'}`);
  doc.moveDown();

  // Tutor details
  const tutor = (payment as any).tutor || {};
  doc.text('Tutor Details', { underline: true });
  doc.text(`Name: ${tutor.name || '-'}`);
  doc.text(`Email: ${tutor.email || '-'}`);
  doc.text(`Phone: ${tutor.phone || '-'}`);
  doc.moveDown();

  // Payment method for paid payments
  if (status === 'PAID') {
    doc.text('Payment Method', { underline: true });
    doc.text(`Method: ${(payment as any).paymentMethod || '-'}`);
    doc.text(`Transaction ID: ${(payment as any).transactionId || '-'}`);
    const paidBy = (payment as any).paidBy || {};
    if (paidBy) doc.text(`Paid By: ${paidBy.name || '-'}`);
    doc.moveDown();
  }

  // Notes
  if ((payment as any).notes) {
    doc.text('Notes', { underline: true });
    doc.text(String((payment as any).notes));
    doc.moveDown();
  }

  // Footer
  doc.fontSize(10).text('Thank you for your service!', { align: 'center' });

  doc.end();
});

export const sendReminderController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse('Validation error', 400);
  const paymentId = req.params.id as string;
  const { reminderMessage } = req.body as { reminderMessage?: string };
  const result = await sendPaymentReminder({ paymentId, reminderMessage, sentBy: req.user!.id });
  return res.json(successResponse(result, 'Payment reminder sent successfully'));
});

export default {
  createPaymentRecord,
  getPayments,
  getPayment,
  updatePaymentStatusController,
  updatePaymentRecord,
  deletePaymentRecord,
  getTutorPayments,
  getMyPaymentSummary,
  getClassPayments,
  getPaymentStats,
  exportPaymentsCSV,
  exportPaymentsPDF,
  downloadPaymentReceipt,
  sendReminderController,
  getMyPaymentsForParent,
  generateAdvancePaymentForClass,
};
