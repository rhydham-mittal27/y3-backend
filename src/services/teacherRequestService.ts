import mongoose from 'mongoose';
import TeacherRequest from '../models/TeacherRequest';
import ErrorResponse from '../utils/errorResponse';
import User from '../models/User';
import Notification from '../models/Notification';
import { sendPushNotification } from '../utils/sendPushNotification';

interface CreateTeacherRequestPayload {
  studentName: string;
  submitterType?: 'PARENT' | 'STUDENT';
  board: string;         // Option ObjectId
  grade: string;         // Option ObjectId
  subjects: string[];    // Option ObjectId[]
  mode: string;
  preferredDays?: string[];
  preferredTimeSlot?: string;
  address?: string;
  city?: string;
  budgetRange?: string;
  notes?: string;
}

export const createTeacherRequest = async (
  parentUserId: string,
  payload: CreateTeacherRequestPayload,
) => {
  const {
    studentName, submitterType, board, grade, subjects, mode,
    preferredDays, preferredTimeSlot, address, city, budgetRange, notes,
  } = payload;

  if (!mongoose.Types.ObjectId.isValid(board))  throw new ErrorResponse('Invalid board ID', 400);
  if (!mongoose.Types.ObjectId.isValid(grade))  throw new ErrorResponse('Invalid grade ID', 400);
  if (!subjects.length)                          throw new ErrorResponse('At least one subject is required', 400);
  for (const s of subjects) {
    if (!mongoose.Types.ObjectId.isValid(s)) throw new ErrorResponse(`Invalid subject ID: ${s}`, 400);
  }

  const request = await TeacherRequest.create({
    parent:           parentUserId,
    submitterType:    submitterType ?? 'PARENT',
    studentName:      studentName.trim(),
    board:            new mongoose.Types.ObjectId(board),
    grade:            new mongoose.Types.ObjectId(grade),
    subjects:         subjects.map((s) => new mongoose.Types.ObjectId(s)),
    mode,
    preferredDays:    preferredDays    ?? [],
    preferredTimeSlot,
    address:          address?.trim(),
    city:             city?.trim(),
    budgetRange:      budgetRange?.trim(),
    notes:            notes?.trim(),
    status:           'NEW',
  });

  await request.populate([
    { path: 'board',    select: 'label value' },
    { path: 'grade',    select: 'label value' },
    { path: 'subjects', select: 'label value' },
  ]);

  return request;
};

export const getMyTeacherRequests = async (parentUserId: string) => {
  return TeacherRequest.find({ parent: parentUserId })
    .populate('board',    'label value')
    .populate('grade',    'label value')
    .populate('subjects', 'label value')
    .sort({ createdAt: -1 })
    .lean();
};

export const getTeacherRequestById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ErrorResponse('Invalid request ID', 400);
  const req = await TeacherRequest.findById(id)
    .populate('parent',   'name email phone')
    .populate('board',    'label value')
    .populate('grade',    'label value')
    .populate('subjects', 'label value')
    .lean();
  if (!req) throw new ErrorResponse('Teacher request not found', 404);
  return req;
};

export const getAllTeacherRequests = async (filters: {
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const { status, page = 1, limit = 20 } = filters;
  const query: any = {};
  if (status) query.status = status;

  const [data, total] = await Promise.all([
    TeacherRequest.find(query)
      .populate('parent',   'name email phone')
      .populate('board',    'label value')
      .populate('grade',    'label value')
      .populate('subjects', 'label value')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TeacherRequest.countDocuments(query),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
};

// Notification copy sent to parent for each status transition
const PARENT_PUSH_COPY: Partial<Record<string, { title: string; body: string; type: string }>> = {
  DEMO_SCHEDULED: {
    type: 'LEAD_UPDATE',
    title: '📅 Demo Class Scheduled!',
    body: 'Great news — a demo class has been arranged for you. Check the app for details.',
  },
  DEMO_COMPLETED: {
    type: 'LEAD_UPDATE',
    title: '✅ Demo Completed',
    body: 'Your demo class is done! We\'re awaiting your approval to start regular classes.',
  },
  CONVERTED: {
    type: 'LEAD_UPDATE',
    title: '🎉 Class Confirmed!',
    body: 'Your tutor has been confirmed and your classes are ready to begin. Welcome aboard!',
  },
  CLOSED: {
    type: 'LEAD_UPDATE',
    title: 'Request Closed',
    body: 'Your tutor request has been closed. Please contact us if you need further help.',
  },
};

export const updateTeacherRequestStatus = async (
  id: string,
  status: string,
  internalNotes?: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ErrorResponse('Invalid request ID', 400);

  const valid = ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'CONVERTED', 'CLOSED'];
  if (!valid.includes(status)) throw new ErrorResponse('Invalid status', 400);

  const updated = await TeacherRequest.findByIdAndUpdate(
    id,
    { status, ...(internalNotes ? { notes: internalNotes } : {}) },
    { new: true },
  )
    .populate('board',    'label value')
    .populate('grade',    'label value')
    .populate('subjects', 'label value');

  if (!updated) throw new ErrorResponse('Teacher request not found', 404);

  // Fire push + in-app notification to the parent for key transitions
  const copy = PARENT_PUSH_COPY[status];
  if (copy && updated.parent) {
    const parentUser = await User.findById(updated.parent).select('expoPushToken');

    // In-app notification (always)
    await Notification.create({
      recipient: updated.parent,
      type:      copy.type,
      title:     copy.title,
      message:   copy.body,
    }).catch(() => {});

    // Push notification (only if token registered)
    await sendPushNotification(
      (parentUser as any)?.expoPushToken,
      copy.title,
      copy.body,
      { type: copy.type, requestId: updated._id.toString() },
    );
  }

  return updated;
};
