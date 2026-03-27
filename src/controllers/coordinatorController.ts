import { validationResult } from 'express-validator';

import asyncHandler from '../utils/asyncHandler';

import { successResponse, paginatedResponse } from '../utils/responseFormatter';

import ErrorResponse from '../utils/errorResponse';

import { AuthRequest } from '../types';

import {

  createCoordinator,

  getAllCoordinators,

  getCoordinatorById,

  getCoordinatorByUserId,

  updateCoordinator,

  updateCoordinatorSettings,

  deleteCoordinator,

  getCoordinatorWorkload,

  getAvailableCoordinators,

  getCoordinatorDashboardStats,

  getCoordinatorTodaysTasks,

  getAssignedClassesSummary,

  getCoordinatorPaymentSummary,

  getCoordinatorProfileMetrics,

  getEligibleCoordinatorUsers,

  getCoordinatorsForVerification,

  updateCoordinatorVerificationStatus,

  uploadCoordinatorDocument,

  deleteCoordinatorDocument,

  getCoordinatorActivityLog,

  getCoordinatorActivityLogByCoordinatorId,

} from '../services/coordinatorService';



export const createCoordinatorProfile = asyncHandler(async (req: AuthRequest, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {

    throw new ErrorResponse(errors.array()[0].msg, 400);

  }

  const { userId, specialization, maxClassCapacity } = req.body;

  const coordinator = await createCoordinator(userId, specialization, maxClassCapacity);

  return res.status(201).json(successResponse(coordinator, 'Coordinator profile created successfully'));

});



export const getCoordinators = asyncHandler(async (req: AuthRequest, res) => {

  const page = parseInt((req.query.page as string) || '1', 10);

  const limit = parseInt((req.query.limit as string) || '10', 10);

  const isActive = typeof req.query.isActive !== 'undefined' ? req.query.isActive === 'true' : undefined;

  const hasCapacity = typeof req.query.hasCapacity !== 'undefined' ? req.query.hasCapacity === 'true' : undefined;

  const sortBy = (req.query.sortBy as string) || undefined;

  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;

  const name = (req.query.name as string) || undefined;

  const email = (req.query.email as string) || undefined;

  const phone = (req.query.phone as string) || undefined;

  const specialization = (req.query.specialization as string) || undefined;

  const search = (req.query.search as string) || undefined;



  const { coordinators, total } = await getAllCoordinators({

    page,

    limit,

    isActive,

    hasCapacity,

    sortBy,

    sortOrder,

    name,

    email,

    phone,

    specialization,

    search,

  });



  return res.json(paginatedResponse(coordinators, page, limit, total));

});



export const getCoordinator = asyncHandler(async (req: AuthRequest, res) => {

  const coordinatorId = req.params.id as string;

  const coordinator = await getCoordinatorById(coordinatorId);

  return res.json(successResponse(coordinator));

});



export const getCoordinatorByUser = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.params.userId as string;

  const coordinator = await getCoordinatorByUserId(userId);

  return res.json(successResponse(coordinator));

});



export const updateCoordinatorProfile = asyncHandler(async (req: AuthRequest, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {

    throw new ErrorResponse(errors.array()[0].msg, 400);

  }

  const coordinatorId = req.params.id as string;

  const updateData = req.body;

  const coordinator = await updateCoordinator(coordinatorId, updateData);

  return res.json(successResponse(coordinator, 'Coordinator updated successfully'));

});



export const updateCoordinatorSettingsController = asyncHandler(async (req: AuthRequest, res) => {

  const coordinatorId = req.params.coordinatorId as string;

  const settingsData = req.body;

  const coordinator = await updateCoordinatorSettings(coordinatorId, settingsData);

  return res.json(successResponse(coordinator, 'Coordinator settings updated successfully'));

});



export const deleteCoordinatorProfile = asyncHandler(async (req: AuthRequest, res) => {

  const coordinatorId = req.params.id as string;

  await deleteCoordinator(coordinatorId);

  return res.json(successResponse(true, 'Coordinator deleted successfully'));

});



export const getWorkload = asyncHandler(async (req: AuthRequest, res) => {

  const coordinatorId = req.params.id as string;

  const data = await getCoordinatorWorkload(coordinatorId);

  return res.json(successResponse(data));

});



export const getAvailableCoordinatorsController = asyncHandler(async (req: AuthRequest, res) => {

  const requiredCapacity = parseInt((req.query.requiredCapacity as string) || '1', 10);

  const result = await getAvailableCoordinators(requiredCapacity);

  return res.json(successResponse(result));

});



// Coordinator Dashboard: Stats

export const getDashboardStats = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.user?.id as string;

  const stats = await getCoordinatorDashboardStats(userId);

  return res.json(successResponse(stats));

});



// Coordinator Dashboard: Today's Tasks

export const getTodaysTasks = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.user?.id as string;

  const tasks = await getCoordinatorTodaysTasks(userId);

  return res.json(successResponse(tasks, "Today's tasks retrieved successfully"));

});



// Coordinator: Assigned Classes Summary (paginated)

export const getAssignedClassesSummaryController = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.user?.id as string;

  const page = parseInt((req.query.page as string) || '1', 10);

  const limit = parseInt((req.query.limit as string) || '10', 10);

  const status = (req.query.status as string) || undefined;

  const subject = (req.query.subject as string) || undefined;

  const grade = (req.query.grade as string) || undefined;

  const sortBy = (req.query.sortBy as string) || undefined;

  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;



  const result = await getAssignedClassesSummary(userId, { page, limit, status, subject, grade, sortBy, sortOrder });

  return res.json(paginatedResponse(result.classes, result.page, result.limit, result.total));

});



// Coordinator: Payments Summary (paginated + categorized)

export const getPaymentSummary = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.user?.id as string;

  const page = parseInt((req.query.page as string) || '1', 10);

  const limit = parseInt((req.query.limit as string) || '10', 10);

  const status = (req.query.status as string) || undefined;

  const classId = (req.query.classId as string) || undefined;

  const fromDateStr = (req.query.fromDate as string) || undefined;

  const toDateStr = (req.query.toDate as string) || undefined;

  const paymentType = (req.query.paymentType as string) || undefined;

  const sortBy = (req.query.sortBy as string) || undefined;

  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;



  const fromDate = fromDateStr ? new Date(fromDateStr) : undefined;

  const toDate = toDateStr ? new Date(toDateStr) : undefined;



  const result = await getCoordinatorPaymentSummary(userId, { page, limit, status, classId, paymentType, fromDate, toDate, sortBy, sortOrder });



  return res.json({

    success: true,

    data: result.payments,

    pagination: { page: result.page, limit: result.limit, total: result.total },

    statistics: result.statistics,

    categorized: result.categorized,

  });

});



// Coordinator: Profile Metrics (date filtered)

export const getProfileMetrics = asyncHandler(async (req: AuthRequest, res) => {

  // Admin/Manager can pass ?userId= to view any coordinator's metrics

  const userId = ((req.query.userId as string) || req.user?.id) as string;

  const fromDateStr = (req.query.fromDate as string) || undefined;

  const toDateStr = (req.query.toDate as string) || undefined;

  const fromDate = fromDateStr ? new Date(fromDateStr) : undefined;

  const toDate = toDateStr ? new Date(toDateStr) : undefined;

  const metrics = await getCoordinatorProfileMetrics(userId, fromDate, toDate);

  return res.json(successResponse(metrics, 'Profile metrics retrieved successfully'));

});



// Manager/Admin: get users eligible to become coordinators (COORDINATOR role without Coordinator profile)

export const getEligibleUsers = asyncHandler(async (_req: AuthRequest, res) => {

  const users = await getEligibleCoordinatorUsers();

  return res.json(successResponse(users));

});



export const getPendingCoordinatorVerifications = asyncHandler(async (_req: AuthRequest, res) => {

  const coordinators = await getCoordinatorsForVerification();

  return res.json(successResponse(coordinators));

});



export const updateCoordinatorVerificationStatusController = asyncHandler(async (req: AuthRequest, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {

    throw new ErrorResponse(errors.array()[0].msg, 400);

  }



  const { status, verificationNotes } = req.body as { status: string; verificationNotes?: string };

  const coordinator = await updateCoordinatorVerificationStatus(

    req.params.id as string,

    status as any,

    verificationNotes,

    String(req.user!.id)

  );

  return res.json(successResponse(coordinator, 'Verification status updated successfully'));

});



export const uploadCoordinatorDocumentController = asyncHandler(async (req: AuthRequest, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {

    throw new ErrorResponse(errors.array()[0].msg, 400);

  }



  const file = (req as any).file as any | undefined;

  if (!file) throw new ErrorResponse('No file uploaded', 400);



  const coordinator = await uploadCoordinatorDocument(req.params.id as string, String(req.body.documentType), file);

  return res.json(successResponse(coordinator, 'Document uploaded successfully'));

});



export const deleteCoordinatorDocumentController = asyncHandler(async (req: AuthRequest, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {

    throw new ErrorResponse(errors.array()[0].msg, 400);

  }



  const index = parseInt(req.params.documentIndex, 10);

  const coordinator = await deleteCoordinatorDocument(req.params.id as string, index);

  return res.json(successResponse(coordinator, 'Document deleted successfully'));

});



export const getMyActivityLogController = asyncHandler(async (req: AuthRequest, res) => {

  const userId = req.user?.id as string;

  const page = parseInt((req.query.page as string) || '1', 10);

  const limit = parseInt((req.query.limit as string) || '20', 10);

  const result = await getCoordinatorActivityLog(userId, page, limit);

  return res.json(paginatedResponse(result.logs, page, limit, result.total));

});



export const getCoordinatorActivityLogController = asyncHandler(async (req: AuthRequest, res) => {

  const coordinatorId = req.params.id as string;

  const page = parseInt((req.query.page as string) || '1', 10);

  const limit = parseInt((req.query.limit as string) || '20', 10);

  const result = await getCoordinatorActivityLogByCoordinatorId(coordinatorId, page, limit);

  return res.json(paginatedResponse(result.logs, page, limit, result.total));

});



export default {

  createCoordinatorProfile,

  getCoordinators,

  getCoordinator,

  getCoordinatorByUser,

  updateCoordinatorProfile,

  updateCoordinatorSettingsController,

  deleteCoordinatorProfile,

  getWorkload,

  getAvailableCoordinatorsController,

  getDashboardStats,

  getTodaysTasks,

  getAssignedClassesSummaryController,

  getPaymentSummary,

  getProfileMetrics,

  getEligibleUsers,

  getPendingCoordinatorVerifications,

  updateCoordinatorVerificationStatusController,

  uploadCoordinatorDocumentController,

  deleteCoordinatorDocumentController,

  getMyActivityLogController,

  getCoordinatorActivityLogController,

};

