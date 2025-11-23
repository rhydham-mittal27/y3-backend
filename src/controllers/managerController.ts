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
  getManagerActivityLog,
  getManagerContribution,
  deleteManagerProfile,
  getManagerTodoList,
} from '../services/managerService';

export const createManagerProfileController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { userId, department } = req.body as { userId: string; department?: string };
  const manager = await createManagerProfile(userId, department);
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
  const manager = await getManagerByUserId(userId);
  return res.json(successResponse(manager));
});

export const updateManagerProfileController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const managerId = req.params.id as string;
  const updateData = req.body as Partial<{ department: string; isActive: boolean }>;
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
};
