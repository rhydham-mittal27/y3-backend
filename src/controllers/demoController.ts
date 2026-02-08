import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { paginatedResponse, successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  assignDemo,
  updateDemoStatus,
  editDemo,
  reassignDemo,
  getDemoHistory,
  getTutorDemoHistory,
} from '../services/demoService';

export const assignDemoController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { leadId } = req.params as any;
  const { tutorUserId, demoDate, demoTime, notes } = req.body;
  const assignedBy = req.user!.id;
  const lead = await assignDemo(leadId, tutorUserId, new Date(demoDate), demoTime, notes, assignedBy);
  res.status(201).json(successResponse(lead, 'Demo assigned successfully'));
});

export const updateDemoStatusController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { leadId } = req.params as any;
  const { status, feedback, rejectionReason, coordinatorUserId } = req.body;
  const updatedBy = req.user!.id;
  const updatedByRole = req.user!.role;
  const lead = await updateDemoStatus(leadId, status, feedback, rejectionReason, updatedBy, updatedByRole, coordinatorUserId);
  res.status(200).json(successResponse(lead, 'Demo status updated successfully'));
});

export const editDemoController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { leadId } = req.params as any;
  const { demoDate, demoTime, notes } = req.body;
  const lead = await editDemo(leadId, demoDate ? new Date(demoDate) : undefined, demoTime, notes);
  res.status(200).json(successResponse(lead, 'Demo details updated successfully'));
});

export const reassignDemoController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { leadId } = req.params as any;
  const { newTutorUserId, demoDate, demoTime, notes } = req.body;
  const assignedBy = req.user!.id;
  const lead = await reassignDemo(leadId, newTutorUserId, new Date(demoDate), demoTime, notes, assignedBy);
  res.status(200).json(successResponse(lead, 'Demo reassigned successfully'));
});

export const getDemoHistoryController = asyncHandler(async (req: AuthRequest, res) => {
  const { leadId } = req.params as any;
  const history = await getDemoHistory(leadId);
  res.status(200).json(successResponse(history));
});

export const getTutorDemoHistoryController = asyncHandler(async (req: AuthRequest, res) => {
  const { tutorId } = req.params as any;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const result = await getTutorDemoHistory(tutorId, page, limit);
  // paginatedResponse expects (data, page, limit, total)
  res.status(200).json(paginatedResponse(result.history, result.page, result.limit, result.total));
});

export const getMyDemosController = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const status = req.query.status as string | undefined;
  const result = await getTutorDemoHistory(req.user!.id, page, limit, status);
  res.status(200).json(paginatedResponse(result.history, result.page, result.limit, result.total));
});
