import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { Parser as Json2CsvParser } from 'json2csv';
import PDFDocument from 'pdfkit';
import {
  getDateWiseClassLeads,
  getClassLeadStatusDistribution,
  getConversionFunnel,
  getFinalClassProgress,
  getTutorProgressReport,
  getCumulativeClassGrowth,
  getPendingApprovals,
  getRevenueAnalytics,
  getOverallStatistics,
  exportDashboardReport,
} from '../services/dashboardService';
import { USER_ROLES } from '../config/constants';

const getManagerId = (req: Request): string | undefined => {
  const user = (req as any).user;
  if (user && user.role === USER_ROLES.MANAGER) {
    return user.id;
  }
  return undefined;
};

export const getDateWiseLeadsChart = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse('Validation error', 400);
  const { fromDate, toDate, groupBy = 'day' } = req.query as any;
  const data = await getDateWiseClassLeads(
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined,
    (groupBy as 'day' | 'week' | 'month') || 'day',
    getManagerId(req)
  );
  return res.status(200).json(successResponse(data, 'Date-wise class leads data retrieved successfully'));
});

export const getLeadStatusDistribution = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate } = req.query as any;
  const data = await getClassLeadStatusDistribution(fromDate ? new Date(fromDate) : undefined, toDate ? new Date(toDate) : undefined, getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const getConversionFunnelData = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate } = req.query as any;
  const data = await getConversionFunnel(fromDate ? new Date(fromDate) : undefined, toDate ? new Date(toDate) : undefined, getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const getFinalClassProgressData = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate } = req.query as any;
  const data = await getFinalClassProgress(fromDate ? new Date(fromDate) : undefined, toDate ? new Date(toDate) : undefined, getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const getTutorProgressReportData = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10', sortBy = 'ratings', sortOrder = 'desc', fromDate, toDate } = req.query as any;
  const result = await getTutorProgressReport(
    parseInt(page, 10),
    parseInt(limit, 10),
    sortBy,
    sortOrder,
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined,
    getManagerId(req)
  );
  return res.status(200).json(paginatedResponse(result.tutors, result.page, result.limit, result.total));
});

export const getCumulativeGrowthChart = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse('Validation error', 400);
  const { fromDate, toDate, groupBy = 'day' } = req.query as any;
  if (!fromDate || !toDate) throw new ErrorResponse('From date and To date are required', 400);
  const data = await getCumulativeClassGrowth(new Date(fromDate), new Date(toDate), (groupBy as 'day' | 'week' | 'month') || 'day', getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const getPendingApprovalsData = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPendingApprovals(getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const getRevenueAnalyticsData = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate, groupBy = 'month' } = req.query as any;
  const data = await getRevenueAnalytics(
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined,
    (groupBy as 'day' | 'week' | 'month') || 'month',
    getManagerId(req)
  );
  return res.status(200).json(successResponse(data));
});

export const getOverallStats = asyncHandler(async (req: Request, res: Response) => {
  const { fromDate, toDate } = req.query as any;
  const data = await getOverallStatistics(fromDate ? new Date(fromDate) : undefined, toDate ? new Date(toDate) : undefined, undefined, getManagerId(req));
  return res.status(200).json(successResponse(data));
});

export const exportDashboardCSV = asyncHandler(async (req: Request, res: Response) => {
  const { reportType, fromDate, toDate } = req.query as any;
  const allowed = ['leads', 'classes', 'tutors', 'revenue', 'comprehensive'];
  if (!reportType || !allowed.includes(reportType)) throw new ErrorResponse('Invalid report type', 400);
  const data = await exportDashboardReport(reportType, {
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
  });
  const parser = new Json2CsvParser({});
  const csv = parser.parse(data as any);
  const ts = Date.now();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=dashboard-report-${reportType}-${ts}.csv`);
  return res.send(csv);
});

export const exportDashboardPDF = asyncHandler(async (req: Request, res: Response) => {
  const { reportType, fromDate, toDate } = req.query as any;
  const allowed = ['leads', 'classes', 'tutors', 'revenue', 'comprehensive'];
  if (!reportType || !allowed.includes(reportType)) throw new ErrorResponse('Invalid report type', 400);
  const data = await exportDashboardReport(reportType, {
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
  });
  const doc = new PDFDocument({ margin: 40 });
  const ts = Date.now();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=dashboard-report-${reportType}-${ts}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text('Your Shikshak - Manager Dashboard Report', { align: 'center' });
  doc.moveDown();
  if (fromDate || toDate) {
    doc.fontSize(10).text(`Range: ${fromDate || '...'} to ${toDate || '...'}`, { align: 'center' });
    doc.moveDown();
  }
  doc.fontSize(14).text(`Report Type: ${reportType.toUpperCase()}`);
  doc.moveDown();

  const printTable = (headers: string[], rows: any[]) => {
    doc.fontSize(12);
    headers.forEach((h, i) => doc.text(h, { continued: i < headers.length - 1, width: 150 }));
    doc.moveDown(0.5);
    rows.forEach((r) => {
      const vals = headers.map((h) => String(r[h] ?? ''));
      vals.forEach((v, i) => doc.text(v, { continued: i < vals.length - 1, width: 150 }));
    });
    doc.moveDown();
  };

  if (reportType === 'leads') {
    printTable(['id', 'studentName', 'grade', 'subject', 'status', 'assignedTutor', 'createdBy', 'createdAt'], data as any[]);
  } else if (reportType === 'classes') {
    printTable(['id', 'studentName', 'grade', 'subject', 'status', 'tutor', 'coordinator', 'convertedBy', 'convertedAt'], data as any[]);
  } else if (reportType === 'tutors') {
    printTable(['id', 'name', 'email', 'experienceHours', 'ratings', 'classesAssigned', 'classesCompleted', 'demosTaken', 'demosApproved', 'approvalRatio', 'verificationStatus', 'createdAt'], data as any[]);
  } else if (reportType === 'revenue') {
    printTable(['id', 'amount', 'status', 'tutor', 'classId', 'createdAt'], data as any[]);
  } else {
    doc.fontSize(12).text('Leads Section');
    doc.moveDown(0.5);
    printTable(['id', 'studentName', 'grade', 'subject', 'status', 'assignedTutor', 'createdBy', 'createdAt'], (data as any[]).filter((d) => !d.section || d.section === 'LEADS'));
    doc.addPage();
    doc.fontSize(12).text('Classes Section');
    doc.moveDown(0.5);
    printTable(['id', 'studentName', 'grade', 'subject', 'status', 'tutor', 'coordinator', 'convertedBy', 'convertedAt'], (data as any[]).filter((d) => !d.section || d.section === 'CLASSES'));
    doc.addPage();
    doc.fontSize(12).text('Tutors Section');
    doc.moveDown(0.5);
    printTable(['id', 'name', 'email', 'experienceHours', 'ratings', 'classesAssigned', 'classesCompleted', 'demosTaken', 'demosApproved', 'approvalRatio', 'verificationStatus', 'createdAt'], (data as any[]).filter((d) => !d.section || d.section === 'TUTORS'));
    doc.addPage();
    doc.fontSize(12).text('Revenue Section');
    doc.moveDown(0.5);
    printTable(['id', 'amount', 'status', 'tutor', 'classId', 'createdAt'], (data as any[]).filter((d) => !d.section || d.section === 'REVENUE'));
  }

  doc.moveDown();
  doc.fontSize(10).text(`Generated at ${new Date().toISOString()}`, { align: 'right' });
  doc.end();
});

export default {
  getDateWiseLeadsChart,
  getLeadStatusDistribution,
  getConversionFunnelData,
  getFinalClassProgressData,
  getTutorProgressReportData,
  getCumulativeGrowthChart,
  getPendingApprovalsData,
  getRevenueAnalyticsData,
  getOverallStats,
  exportDashboardCSV,
  exportDashboardPDF,
};
