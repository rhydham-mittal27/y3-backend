import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  createClassLead,
  getAllClassLeads,
  getClassLeadById,
  updateClassLead,
  updateClassLeadStatus,
  deleteClassLead,
  getLeadsByManager,
} from '../services/leadService';

export const createLead = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const {
    studentName,
    parentName,
    parentPhone,
    grade,
    subject,
    board,
    mode,
    location,
    city,
    area,
    address,
    timing,
    classesPerMonth,
    classDurationHours,
    preferredTutorGender,
    leadSource,
    paymentReceived,
    paymentAmount,
    notes,
  } = req.body;
  const createdBy = req.user!.id;

  const lead = await createClassLead({
    studentName,
    parentName,
    parentPhone,
    grade,
    subject,
    board,
    mode,
    location,
    city,
    area,
    address,
    timing,
    classesPerMonth,
    classDurationHours,
    preferredTutorGender,
    leadSource,
    paymentReceived,
    paymentAmount,
    notes,
    createdBy,
  });

  return res.status(201).json(successResponse(lead, 'Class lead created successfully'));
});

export const getLeads = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const status = (req.query.status as string) || undefined;
  const createdBy = (req.query.createdBy as string) || undefined;
  const search = (req.query.search as string) || undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;

  const { leads, total } = await getAllClassLeads({
    page,
    limit,
    status,
    createdBy,
    search,
    sortBy,
    sortOrder,
  });

  return res.json(paginatedResponse(leads, page, limit, total));
});

export const getLead = asyncHandler(async (req: AuthRequest, res) => {
  const leadId = req.params.id as string;
  const lead = await getClassLeadById(leadId);
  return res.json(successResponse(lead));
});

export const updateLead = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const leadId = req.params.id as string;
  const updateData = req.body;
  const lead = await updateClassLead(leadId, updateData);
  return res.json(successResponse(lead, 'Class lead updated successfully'));
});

export const updateLeadStatus = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const leadId = req.params.id as string;
  const newStatus = req.body.status as string;
  const userId = req.user!.id;
  const lead = await updateClassLeadStatus(leadId, newStatus, userId);
  return res.json(successResponse(lead, 'Status updated successfully'));
});

export const deleteLead = asyncHandler(async (req: AuthRequest, res) => {
  const leadId = req.params.id as string;
  await deleteClassLead(leadId);
  return res.json(successResponse(true, 'Class lead deleted successfully'));
});

export const getMyLeads = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.user!.id;
  const leads = await getLeadsByManager(managerId);
  return res.json(successResponse(leads));
});

export default {
  createLead,
  getLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  getMyLeads,
};
