import mongoose from 'mongoose';
import ClassLead, { IClassLeadDocument } from '../models/ClassLead';
import ErrorResponse from '../utils/errorResponse';
import { BOARD_TYPE, CLASS_LEAD_STATUS, TEACHING_MODE, MANAGER_ACTION_TYPE } from '../config/constants';
import Manager from '../models/Manager';
import { logManagerActivity } from './managerService';

export const createClassLead = async (params: {
  studentName: string;
  grade: string;
  subject: string[];
  board: BOARD_TYPE | string;
  mode: TEACHING_MODE | string;
  location?: string;
  timing: string;
  notes?: string;
  createdBy: string;
}) => {
  const { createdBy, ...rest } = params;
  const lead = new ClassLead({
    ...rest,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    status: CLASS_LEAD_STATUS.NEW,
  });
  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);

  try {
    await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(createdBy) }, { $inc: { classLeadsCreated: 1 } });
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.CREATE_CLASS_LEAD,
      `Created class lead for student ${lead.studentName}`,
      { entityType: 'ClassLead', entityId: String(lead._id), entityName: lead.studentName },
      { grade: lead.grade, subject: lead.subject, board: lead.board, mode: lead.mode }
    );
  } catch {}
  return lead;
};

export const getAllClassLeads = async (args: {
  page: number;
  limit: number;
  status?: CLASS_LEAD_STATUS | string;
  createdBy?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, status, createdBy, search, sortBy, sortOrder } = args;

  const query: any = {};
  if (status) query.status = status;
  if (createdBy) query.createdBy = new mongoose.Types.ObjectId(createdBy);
  if (search) query.$text = { $search: search };

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [leads, total] = await Promise.all([
    ClassLead.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'createdBy', select: 'name email role' },
        { path: 'assignedTutor', select: 'name email phone' },
      ]),
    ClassLead.countDocuments(query),
  ]);

  return { leads, total, page, limit };
};

export const getClassLeadById = async (leadId: string) => {
  const lead = await ClassLead.findById(leadId).populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }
  return lead;
};

export const updateClassLead = async (
  leadId: string,
  updateData: Partial<{
    studentName: string;
    grade: string;
    subject: string[];
    board: BOARD_TYPE | string;
    mode: TEACHING_MODE | string;
    location?: string;
    timing: string;
    notes?: string;
  }>
) => {
  if (Object.prototype.hasOwnProperty.call(updateData, 'status')) {
    throw new ErrorResponse('Status cannot be updated via this endpoint', 400);
  }

  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  Object.assign(lead, updateData);
  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);
  try {
    const createdBy = String((lead.createdBy as any)?._id || lead.createdBy);
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.UPDATE_CLASS_LEAD,
      `Updated class lead for student ${lead.studentName}`,
      { entityType: 'ClassLead', entityId: String(lead._id), entityName: lead.studentName },
      updateData
    );
  } catch {}
  return lead;
};

export const updateClassLeadStatus = async (
  leadId: string,
  newStatus: CLASS_LEAD_STATUS | string,
  _userId: string
) => {
  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  const current = lead.status as CLASS_LEAD_STATUS;
  const allowedTransitions: Record<CLASS_LEAD_STATUS, (CLASS_LEAD_STATUS | string)[]> = {
    [CLASS_LEAD_STATUS.NEW]: [CLASS_LEAD_STATUS.ANNOUNCED],
    [CLASS_LEAD_STATUS.ANNOUNCED]: [CLASS_LEAD_STATUS.DEMO_SCHEDULED],
    [CLASS_LEAD_STATUS.DEMO_SCHEDULED]: [CLASS_LEAD_STATUS.DEMO_COMPLETED],
    [CLASS_LEAD_STATUS.DEMO_COMPLETED]: [CLASS_LEAD_STATUS.CONVERTED, CLASS_LEAD_STATUS.REJECTED],
    [CLASS_LEAD_STATUS.CONVERTED]: [],
    [CLASS_LEAD_STATUS.REJECTED]: [],
  };

  if (current === newStatus) {
    return lead; // no change
  }

  if (!allowedTransitions[current]?.includes(newStatus)) {
    throw new ErrorResponse('Invalid status transition', 400);
  }

  lead.status = newStatus as any;
  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);
  return lead;
};

export const deleteClassLead = async (leadId: string) => {
  const existing = await ClassLead.findById(leadId);
  if (!existing) {
    throw new ErrorResponse('Class lead not found', 404);
  }
  await ClassLead.findByIdAndDelete(leadId);
  try {
    const createdBy = String((existing.createdBy as any)?._id || existing.createdBy);
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.DELETE_CLASS_LEAD,
      `Deleted class lead for student ${existing.studentName}`,
      { entityType: 'ClassLead', entityId: String(existing._id), entityName: existing.studentName }
    );
  } catch {}
  return true;
};

export const getLeadsByManager = async (managerId: string) => {
  const leads = await ClassLead.find({ createdBy: managerId })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTutor', select: 'name email phone' },
    ]);
  return leads;
};

export default {
  createClassLead,
  getAllClassLeads,
  getClassLeadById,
  updateClassLead,
  updateClassLeadStatus,
  deleteClassLead,
  getLeadsByManager,
};
