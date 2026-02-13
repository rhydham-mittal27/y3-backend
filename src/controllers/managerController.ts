import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  createManagerProfile,
  getAllManagers,
  getManagerById,
  getManagerByUserId,
  updateManagerProfile,
  updateManagerSettings,
  getManagerMetrics,
  getManagerPerformanceHistory,
  deleteManagerProfile,
  getManagerActivityLog,
  getManagerContribution,
  getManagerTodoList,
  updateManagerDocuments,
  uploadManagerDocument,
  getEligibleManagerUsers,
} from '../services/managerService';
import { USER_ROLES } from '../config/constants';

export const createManagerProfileController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { userId, permissions } = req.body as {
    userId: string;
    permissions?: {
      canViewSiteLeads?: boolean;
      canVerifyTutors?: boolean;
      canCreateLeads?: boolean;
      canManagePayments?: boolean;
    };
  };
  const manager = await createManagerProfile(userId, permissions);
  return res.status(201).json(successResponse(manager, 'Manager profile created successfully'));
});

export const getManagers = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const isActive = typeof req.query.isActive !== 'undefined' ? req.query.isActive === 'true' : undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
  const { managers, total } = await getAllManagers({ page, limit, isActive, sortBy, sortOrder });
  return res.json(paginatedResponse(managers, page, limit, total));
});

export const getManager = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const manager = await getManagerById(managerId);
  return res.json(successResponse(manager));
});

export const getManagerByUser = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.params.userId as string;
  const manager = await getManagerByUserId(userId);
  return res.json(successResponse(manager));
});

export const getMyProfile = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id as string;
  try {
    const manager = await getManagerByUserId(userId);
    return res.json(successResponse(manager));
  } catch (error: any) {
    if (error.statusCode === 404) {
      // Auto-create profile if it doesn't exist (e.g. for seeded users or failed registrations)
      const newManager = await createManagerProfile(userId);
      return res.json(successResponse(newManager, 'Manager profile created and fetched'));
    }
    throw error;
  }
});

export const updateManagerProfileController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  
  const managerId = req.params.id as string;
  const currentUser = req.user;
  
  if (!currentUser || !currentUser.id) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  
  const isManager = currentUser.role === USER_ROLES.MANAGER;
  
  // Ownership check for managers
  if (isManager) {
    const manager = await getManagerByUserId(currentUser.id);
    if (String(manager._id) !== managerId) {
      throw new ErrorResponse('You can only update your own profile', 403);
    }
  }

  const updateData = req.body as Partial<{
    isActive: boolean;
    permissions: {
      canViewSiteLeads?: boolean;
      canVerifyTutors?: boolean;
      canCreateLeads?: boolean;
      canManagePayments?: boolean;
    };
    bio: string;
    languagesKnown: string[];
    skills: string[];
    permanentAddress: string;
    residentialAddress: string;
    documents: any[];
  }>;

  // Sanitization: managers cannot update status or permissions
  if (isManager) {
    delete updateData.isActive;
    delete updateData.permissions;
  }

  const manager = await updateManagerProfile(managerId, updateData);
  return res.json(successResponse(manager, 'Manager profile updated successfully'));
});

export const updateManagerSettingsController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.managerId as string;
  const settingsData = req.body;
  const manager = await updateManagerSettings(managerId, settingsData);
  return res.json(successResponse(manager, 'Manager settings updated successfully'));
});

export const getManagerMetricsController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const metrics = await getManagerMetrics(managerId, fromDate, toDate);
  return res.json(successResponse(metrics));
});

export const getManagerPerformanceHistoryController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const fromDate = new Date(String(req.query.fromDate));
  const toDate = new Date(String(req.query.toDate));
  const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') || 'month';
  const data = await getManagerPerformanceHistory(managerId, fromDate, toDate, groupBy);
  return res.json(successResponse(data));
});

export const getManagerActivityLogController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const actionType = (req.query.actionType as any) || undefined;
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const entityType = (req.query.entityType as any) || undefined;
  const { activities, total } = await getManagerActivityLog(managerId, page, limit, actionType, fromDate, toDate, entityType);
  return res.json(paginatedResponse(activities, page, limit, total));
});

export const getManagerContributionController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const data = await getManagerContribution(managerId, fromDate, toDate);
  return res.json(successResponse(data));
});

export const getManagerTodoListController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  const leads = await getManagerTodoList(managerId);
  return res.json(successResponse(leads));
});

export const getMyMetrics = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id as string;
  const manager = await getManagerByUserId(userId);
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const metrics = await getManagerMetrics(String(manager._id), fromDate, toDate);
  return res.json(successResponse(metrics));
});

export const getMyActivityLog = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id as string;
  const manager = await getManagerByUserId(userId);
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const actionType = (req.query.actionType as any) || undefined;
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const entityType = (req.query.entityType as any) || undefined;
  const { activities, total } = await getManagerActivityLog(String(manager._id), page, limit, actionType, fromDate, toDate, entityType);
  return res.json(paginatedResponse(activities, page, limit, total));
});

export const deleteManagerProfileController = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.params.id as string;
  await deleteManagerProfile(managerId);
  return res.json(successResponse(true, 'Manager profile deleted successfully'));
});

export const uploadManagerDocumentsController = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id as string;
  const { documents } = req.body as { documents: any[] };
  
  if (!documents || !Array.isArray(documents)) {
    throw new ErrorResponse('Documents are required and must be an array', 400);
  }

  const manager = await updateManagerDocuments(userId, documents);
  return res.json(successResponse(manager, 'Documents updated successfully'));
});

export const uploadManagerDocumentController = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id as string;
  const file = (req as any).file;
  const { documentType } = req.body;

  if (!file) throw new ErrorResponse('No file uploaded', 400);
  if (!documentType) throw new ErrorResponse('Document type is required', 400);

  const manager = await uploadManagerDocument(userId, documentType, file);
  return res.json(successResponse(manager, 'Document uploaded successfully'));
});

export const getEligibleManagerUsersController = asyncHandler(async (_req: AuthRequest, res) => {
  const users = await getEligibleManagerUsers();
  return res.json(successResponse(users));
});

export default {
  createManagerProfileController,
  getManagers,
  getManager,
  getManagerByUser,
  getMyProfile,
  updateManagerProfileController,
  updateManagerSettingsController,
  getManagerMetricsController,
  getManagerPerformanceHistoryController,
  getManagerActivityLogController,
  getManagerContributionController,
  getMyMetrics,
  getMyActivityLog,
  deleteManagerProfileController,
  getManagerTodoListController,
  uploadManagerDocumentsController,
  uploadManagerDocumentController,
  getEligibleManagerUsersController,
};
