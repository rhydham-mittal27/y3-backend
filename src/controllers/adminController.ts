import { Response } from 'express';
import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { USER_ROLES, PAYMENT_STATUS } from '../config/constants';
import { Parser as Json2CsvParser } from 'json2csv';
import PDFDocument from 'pdfkit';
import {
  createAdminProfile,
  getAllAdmins,
  getAdminById,
  getAdminByUserId,
  updateAdminProfile,
  updateAdminSettings,
  deleteAdminProfile,
  getSystemWideAnalytics,
  bulkUpdateUsers,
  bulkUpdateManagers,
  bulkUpdateCoordinators,
  bulkUpdatePayments,
  bulkDeleteRecords,
  createUserWithRole,
  bulkCreateUsers,
} from '../services/adminService';

export const createAdminProfileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const { userId, department } = req.body as { userId: string; department?: string };
  const admin = await createAdminProfile(userId, department);
  return res.status(201).json(successResponse(admin, 'Admin profile created successfully'));
});

export const getAdmins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const isActive = typeof req.query.isActive !== 'undefined' ? (req.query.isActive === 'true' || req.query.isActive === '1') : undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = ((req.query.sortOrder as 'asc' | 'desc') || 'desc');

  const { admins, total } = await getAllAdmins({ page, limit, isActive, sortBy, sortOrder });
  return res.json(paginatedResponse(admins, page, limit, total));
});

export const getAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const adminId = req.params.id as string;
  const admin = await getAdminById(adminId);
  return res.json(successResponse(admin));
});

export const getAdminByUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId as string;
  const admin = await getAdminByUserId(userId);
  return res.json(successResponse(admin));
});

export const getMyProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id as string;
  try {
    const admin = await getAdminByUserId(userId);
    return res.json(successResponse(admin));
  } catch (err: any) {
    if (err instanceof ErrorResponse && err.statusCode === 404 && req.user?.role === USER_ROLES.ADMIN) {
      const created = await createAdminProfile(userId);
      return res.status(201).json(successResponse(created, 'Admin profile created'));
    }
    throw err;
  }
});

export const updateAdminProfileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminId = req.params.id as string;
  const updateData = req.body as Partial<{ department: string; isActive: boolean }>;
  const admin = await updateAdminProfile(adminId, updateData);
  return res.json(successResponse(admin, 'Admin profile updated successfully'));
});

export const updateAdminSettingsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const adminId = req.params.adminId as string;
  const settingsData = req.body;
  const admin = await updateAdminSettings(adminId, settingsData);
  return res.json(successResponse(admin, 'Admin settings updated successfully'));
});

export const deleteAdminProfileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const adminId = req.params.id as string;
  await deleteAdminProfile(adminId);
  return res.json(successResponse(true, 'Admin profile deleted successfully'));
});

export const getSystemAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
  const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
  if (fromDate) { fromDate.setHours(0,0,0,0); }
  if (toDate) { toDate.setHours(23,59,59,999); }

  const analytics = await getSystemWideAnalytics(fromDate, toDate);
  return res.json(successResponse(analytics, 'System analytics retrieved successfully'));
});

export const exportAnalyticsCSVController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
  const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
  if (fromDate) { fromDate.setHours(0,0,0,0); }
  if (toDate) { toDate.setHours(23,59,59,999); }
  const reportType = (req.query.reportType as string) || 'comprehensive';

  const a = await getSystemWideAnalytics(fromDate, toDate);

  // Build rows based on report type (simple, safe keys)
  const rows: Array<Record<string, any>> = [];
  const pushKV = (section: string, key: string, value: any) => rows.push({ section, metric: key, value });

  if (reportType === 'users' || reportType === 'comprehensive') {
    pushKV('Users', 'Total Users', a?.users?.totals?.totalUsers ?? 0);
    pushKV('Users', 'Active Users', a?.users?.totals?.totalActiveUsers ?? 0);
    Object.entries(a?.users?.byRole || {}).forEach(([role, v]: any) => {
      pushKV('UsersByRole', `${role} Count`, (v as any)?.count ?? 0);
      pushKV('UsersByRole', `${role} Active`, (v as any)?.active ?? 0);
    });
  }

  if (reportType === 'financial' || reportType === 'comprehensive') {
    pushKV('Finance', 'Gross Revenue', a?.finance?.grossRevenue ?? 0);
    pushKV('Finance', 'Collection Rate', a?.finance?.collectionRate ?? 0);
    pushKV('Finance', 'Overdue Payments', a?.health?.overduePayments ?? 0);
  }

  if (reportType === 'performance' || reportType === 'comprehensive') {
    pushKV('Managers', 'Active Managers', a?.managers?.activeManagers ?? 0);
    pushKV('Managers', 'Total Leads', a?.managers?.totals?.totalLeads ?? 0);
    pushKV('Managers', 'Total Classes', a?.managers?.totals?.totalClasses ?? 0);
  }

  if (reportType === 'health' || reportType === 'comprehensive') {
    pushKV('Health', 'Pending Approvals (Total)', a?.health?.pendingApprovals?.totalPending ?? a?.health?.pendingApprovals?.attendance?.total ?? 0);
    pushKV('Health', 'Inactive Users', Object.values(a?.health?.inactiveUsersByRole || {}).reduce((s: number, v: any) => s + (v || 0), 0));
  }

  if (reportType === 'classes' || reportType === 'comprehensive') {
    pushKV('Classes', 'Total Final Classes', a?.base?.finalClasses?.total ?? 0);
    pushKV('Classes', 'Active Final Classes', a?.base?.finalClasses?.active ?? 0);
  }

  // Fallback to something if empty
  if (rows.length === 0) {
    pushKV('Info', 'Note', 'No data available for the selected report type');
  }

  const parser = new Json2CsvParser({ fields: ['section', 'metric', 'value'] });
  const csv = parser.parse(rows);
  const filename = `admin-analytics-${reportType}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

export const exportAnalyticsPDFController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
  const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
  if (fromDate) { fromDate.setHours(0,0,0,0); }
  if (toDate) { toDate.setHours(23,59,59,999); }
  const reportType = (req.query.reportType as string) || 'comprehensive';

  const a = await getSystemWideAnalytics(fromDate, toDate);

  const filename = `admin-analytics-${reportType}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text('Admin Analytics Report', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Report Type: ${reportType}`);
  if (fromDate) doc.text(`From: ${fromDate.toISOString().slice(0, 10)}`);
  if (toDate) doc.text(`To: ${toDate.toISOString().slice(0, 10)}`);
  doc.moveDown();

  const section = (title: string) => { doc.moveDown(0.5); doc.fontSize(14).text(title, { underline: true }); doc.moveDown(0.25); doc.fontSize(12); };
  const line = (k: string, v: any) => doc.text(`${k}: ${v ?? '-'}`);

  if (reportType === 'users' || reportType === 'comprehensive') {
    section('Users');
    line('Total Users', a?.users?.totals?.totalUsers);
    line('Active Users', a?.users?.totals?.totalActiveUsers);
  }

  if (reportType === 'financial' || reportType === 'comprehensive') {
    section('Finance');
    line('Gross Revenue', a?.finance?.grossRevenue);
    line('Collection Rate', a?.finance?.collectionRate);
  }

  if (reportType === 'performance' || reportType === 'comprehensive') {
    section('Manager Performance');
    line('Active Managers', a?.managers?.activeManagers);
    line('Total Leads', a?.managers?.totals?.totalLeads);
    line('Total Classes', a?.managers?.totals?.totalClasses);
  }

  if (reportType === 'health' || reportType === 'comprehensive') {
    section('System Health');
    line('Pending Approvals (Total)', a?.health?.pendingApprovals?.totalPending ?? a?.health?.pendingApprovals?.attendance?.total);
    line('Overdue Payments', a?.health?.overduePayments);
  }

  if (reportType === 'classes' || reportType === 'comprehensive') {
    section('Classes');
    line('Total Final Classes', a?.base?.finalClasses?.total);
    line('Active Final Classes', a?.base?.finalClasses?.active);
  }

  doc.end();
});

export const bulkUpdateUsersController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { filter, updateData } = req.body as {
    filter: { role?: string; isActive?: boolean; ids?: string[] };
    updateData: { isActive?: boolean };
  };

  const result = await bulkUpdateUsers(filter, updateData, adminUserId);
  return res.json(successResponse(result, 'Users updated successfully'));
});

export const bulkUpdateManagersController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { filter, updateData } = req.body as {
    filter: { isActive?: boolean; department?: string; ids?: string[] };
    updateData: { isActive?: boolean; department?: string };
  };

  const result = await bulkUpdateManagers(filter, updateData, adminUserId);
  return res.json(successResponse(result, 'Managers updated successfully'));
});

export const bulkUpdateCoordinatorsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { filter, updateData } = req.body as {
    filter: { isActive?: boolean; ids?: string[] };
    updateData: { isActive?: boolean; maxClassCapacity?: number };
  };

  const result = await bulkUpdateCoordinators(filter, updateData, adminUserId);
  return res.json(successResponse(result, 'Coordinators updated successfully'));
});

export const bulkUpdatePaymentsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { filter, updateData } = req.body as {
    filter: {
      status?: PAYMENT_STATUS;
      finalClassId?: string;
      tutorId?: string;
      ids?: string[];
      fromDate?: string | Date;
      toDate?: string | Date;
    };
    updateData: { status?: PAYMENT_STATUS; paymentDate?: string | Date; paidBy?: string };
  };

  const parsedFilter = {
    ...filter,
    fromDate: filter?.fromDate ? new Date(filter.fromDate as any) : undefined,
    toDate: filter?.toDate ? new Date(filter.toDate as any) : undefined,
  };

  const parsedUpdateData = {
    ...updateData,
  } as any;

  const update: Partial<{ status: PAYMENT_STATUS; paymentDate: Date; paidBy: string }> = {};
  if (parsedUpdateData?.status) update.status = parsedUpdateData.status as PAYMENT_STATUS;
  if (parsedUpdateData?.paymentDate) update.paymentDate = new Date(parsedUpdateData.paymentDate as any);
  if (parsedUpdateData?.paidBy) update.paidBy = parsedUpdateData.paidBy as string;

  const result = await bulkUpdatePayments(parsedFilter, update, adminUserId);
  return res.json(successResponse(result, 'Payments updated successfully'));
});

export const bulkDeleteRecordsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { entityType, filter } = req.body as {
    entityType: 'ClassLead' | 'Payment' | 'Attendance';
    filter: { ids: string[] };
  };

  const result = await bulkDeleteRecords(entityType, filter, adminUserId);
  return res.json(successResponse(result, 'Records deleted successfully'));
});

export const createUserController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { userData } = req.body as {
    userData: { name: string; email: string; password: string; phone?: string; role: USER_ROLES };
  };

  const payload = { ...userData, role: userData.role as USER_ROLES };
  const result = await createUserWithRole(payload, adminUserId);
  return res.status(201).json(successResponse(result, 'User created successfully'));
});

export const bulkCreateUsersController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0]?.msg || 'Validation error';
    throw new ErrorResponse(firstError as string, 400);
  }

  const adminUserId = req.user?.id as string;
  const { usersData } = req.body as {
    usersData: Array<{ name: string; email: string; password: string; phone?: string; role: USER_ROLES }>;
  };

  const payload = usersData.map((u) => ({ ...u, role: u.role as USER_ROLES }));
  const result = await bulkCreateUsers(payload, adminUserId);
  return res.status(201).json(successResponse(result, 'Bulk user creation completed'));
});

export default {
  createAdminProfileController,
  getAdmins,
  getAdmin,
  getAdminByUser,
  getMyProfile,
  updateAdminProfileController,
   updateAdminSettingsController,
  deleteAdminProfileController,
  getSystemAnalytics,
  bulkUpdateUsersController,
  bulkUpdateManagersController,
  bulkUpdateCoordinatorsController,
  bulkUpdatePaymentsController,
  bulkDeleteRecordsController,
  createUserController,
  bulkCreateUsersController,
  exportAnalyticsCSVController,
  exportAnalyticsPDFController,
};
