import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  convertLeadToFinalClass,
  getAllFinalClasses,
  getFinalClassById,
  updateFinalClass,
  updateFinalClassStatus,
  updateSessionProgress,
  getClassesByCoordinator,
  getClassesByTutor,
} from '../services/finalClassService';
import { FINAL_CLASS_STATUS } from '../config/constants';

export const convertToFinalClass = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classLeadId = req.params.leadId as string;
  const { coordinatorUserId, startDate, schedule, totalSessions, notes } = req.body;
  const convertedBy = req.user!.id;

  const result = await convertLeadToFinalClass({
    classLeadId,
    coordinatorUserId,
    startDate,
    schedule,
    totalSessions,
    notes,
    convertedBy,
  });

  return res.status(201).json(successResponse(result, 'Class lead converted to final class successfully'));
});

export const getFinalClasses = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const status = (req.query.status as string) || undefined;
  const coordinatorId = (req.query.coordinatorId as string) || undefined;
  const tutorId = (req.query.tutorId as string) || undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;

  const { classes, total } = await getAllFinalClasses({
    page,
    limit,
    status,
    coordinatorId,
    tutorId,
    sortBy,
    sortOrder,
  });

  return res.json(paginatedResponse(classes, page, limit, total));
});

export const getFinalClass = asyncHandler(async (req: AuthRequest, res) => {
  const classId = req.params.id as string;
  const cls = await getFinalClassById(classId);
  return res.json(successResponse(cls));
});

export const updateFinalClassDetails = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const updateData = req.body;
  const cls = await updateFinalClass(classId, updateData);
  return res.json(successResponse(cls, 'Final class updated successfully'));
});

export const updateClassStatus = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const { status, actualEndDate } = req.body;
  const cls = await updateFinalClassStatus(classId, status, actualEndDate);
  return res.json(successResponse(cls, 'Class status updated successfully'));
});

export const updateProgress = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const classId = req.params.id as string;
  const { completedSessions } = req.body;
  const cls = await updateSessionProgress(classId, completedSessions);
  return res.json(successResponse(cls, 'Session progress updated successfully'));
});

export const getCoordinatorClasses = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.params.coordinatorId as string;
  const status = (req.query.status as string) || undefined;
  const classes = await getClassesByCoordinator(coordinatorUserId, status);
  return res.json(successResponse(classes));
});

export const getTutorClasses = asyncHandler(async (req: AuthRequest, res) => {
  const tutorUserId = req.params.tutorId as string;
  const status = (req.query.status as string) || undefined;
  const classes = await getClassesByTutor(tutorUserId, status);
  return res.json(successResponse(classes));
});

export const getMyClassesController = asyncHandler(async (req: AuthRequest, res) => {
  const status = (req.query.status as string) || FINAL_CLASS_STATUS.ACTIVE;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const classes = await getClassesByTutor(req.user!.id, status);

  const total = classes.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedClasses = classes.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedClasses, page, limit, total));
});

export default {
  convertToFinalClass,
  getFinalClasses,
  getFinalClass,
  updateFinalClassDetails,
  updateClassStatus,
  updateProgress,
  getCoordinatorClasses,
  getTutorClasses,
  getMyClassesController,
};
