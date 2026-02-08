import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import User from '../models/User';
import {
  createClassLead,
  getAllClassLeads,
  getClassLeadById,
  updateClassLead,
  updateClassLeadStatus,
  deleteClassLead,
  getLeadsByManager,
  getLeadsByTutor,
  getDistinctFilterValues,
  getCRMLeadsGrouped,
  reassignClassLead,
} from '../services/leadService';
import { getManagerByUserId } from '../services/managerService';
import { USER_ROLES } from '../config/constants';

export const createLead = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  // Permission check for Managers
  if (req.user!.role === USER_ROLES.MANAGER) {
    const manager = await getManagerByUserId(req.user!.id);
    if (!manager.permissions?.canCreateLeads) {
      throw new ErrorResponse('You do not have permission to create leads.', 403);
    }
  }

  const {
    studentType,
    studentName,
    studentGender,
    parentName,
    parentEmail,
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
    tutorFees,
    notes,
    numberOfStudents,
    studentDetails,
  } = req.body;
  const createdBy = req.user!.id;

  const normalizedStudentGender =
    studentType === 'GROUP' || !studentGender ? undefined : studentGender;

  const lead = await createClassLead({
    studentType,
    studentName,
    studentGender: normalizedStudentGender,
    parentName,
    parentEmail,
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
    tutorFees,
    notes,
    numberOfStudents,
    studentDetails,
    createdBy,
  });

  return res.status(201).json(successResponse(lead, 'Class lead created successfully'));
});

export const getLeads = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const status = (req.query.status as string) || undefined;
  let createdBy = (req.query.createdBy as string) || undefined;
  const search = (req.query.search as string) || undefined;
  const sortBy = (req.query.sortBy as string) || undefined;
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;
  const studentName = (req.query.studentName as string) || undefined;
  const grade = (req.query.grade as string) || undefined;
  const subject = (req.query.subject as string) || undefined;
  const board = (req.query.board as string) || undefined;
  const mode = (req.query.mode as string) || undefined;
  let createdByName = (req.query.createdByName as string) || undefined;
  const area = (req.query.area as string) || undefined;

  // Enforce role-based visibility
  let createdByIds: string[] | undefined;
  if (req.user!.role === 'MANAGER') {
    const manager = await getManagerByUserId(req.user!.id);
    
    // If manager CANNOT view site leads (admin leads), restrict to their own
    if (!manager.permissions?.canViewSiteLeads) {
      createdBy = req.user!.id;
      createdByName = undefined; // Clear other creator filters
    } else {
      // If they CAN view site leads, show admin leads + their own leads
      // Get all admin user IDs
      const adminUsers = await User.find({ role: 'ADMIN' }).select('_id');
      const adminIds = adminUsers.map(u => u._id.toString());
      // Combine admin IDs with the current manager's ID
      createdByIds = [...adminIds, req.user!.id];
      // Clear any createdBy filter from query params
      createdBy = undefined;
      createdByName = undefined;
    }
  }


  const { leads, total } = await getAllClassLeads({
    page,
    limit,
    status,
    createdBy,
    createdByIds,
    search,
    sortBy,
    sortOrder,
    studentName,
    grade,
    subject,
    board,
    mode,
    createdByName,
    area,
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

export const getTutorLeads = asyncHandler(async (req: AuthRequest, res) => {
  const tutorUserId = req.user!.id;
  const leads = await getLeadsByTutor(tutorUserId);
  return res.json(successResponse(leads));
});

export const getFilterOptions = asyncHandler(async (_req: AuthRequest, res) => {
  const options = await getDistinctFilterValues();
  return res.json(successResponse(options));
});

export const getCRMLeads = asyncHandler(async (req: AuthRequest, res) => {
  const managerId = req.user!.role === USER_ROLES.MANAGER 
    ? req.user!.id 
    : (req.query.managerId as string || undefined);
    
  const groups = await getCRMLeadsGrouped(managerId);
  return res.json(successResponse(groups));
});

export const reassignLead = asyncHandler(async (req: AuthRequest, res) => {
  const leadId = req.params.id as string;
  const { managerId } = req.body;
  if (!managerId) {
    throw new ErrorResponse('New manager ID is required', 400);
  }
  const lead = await reassignClassLead(leadId, managerId);
  return res.json(successResponse(lead, 'Class lead reassigned successfully'));
});

export default {
  createLead,
  getLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  getMyLeads,
  getTutorLeads,
  getFilterOptions,
  getCRMLeads,
  reassignLead,
};
