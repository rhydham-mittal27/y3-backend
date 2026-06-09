import mongoose from 'mongoose';
import ShiftRequest from '../models/ShiftRequest';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { applyShiftToPlannedSessions } from './classSessionService';
import { createNotificationWithPreferences } from './notificationService';

export const createShiftRequest = async (params: {
  finalClassId: string;
  cycleNumber: number;
  requestedBy: string;
  shiftDays: number;
  reason: string;
}) => {
  const { finalClassId, cycleNumber, requestedBy, shiftDays, reason } = params;

  if (!shiftDays || shiftDays === 0) throw new ErrorResponse('shiftDays must be a non-zero integer', 400);
  if (!reason?.trim()) throw new ErrorResponse('Reason is required', 400);

  const cls: any = await FinalClass.findById(finalClassId);
  if (!cls) throw new ErrorResponse('Class not found', 404);
  if (String(cls.tutor) !== requestedBy) throw new ErrorResponse('Only the assigned tutor can request a shift', 403);
  if (cls.status !== 'ACTIVE') throw new ErrorResponse('Shift requests are only allowed for active classes', 400);

  // One pending request per class+cycle at a time
  const existing = await ShiftRequest.findOne({ finalClass: finalClassId, cycleNumber, status: 'PENDING' });
  if (existing) throw new ErrorResponse('A pending shift request already exists for this cycle', 409);

  const request = await ShiftRequest.create({
    finalClass: new mongoose.Types.ObjectId(finalClassId),
    cycleNumber,
    requestedBy: new mongoose.Types.ObjectId(requestedBy),
    shiftDays,
    reason: reason.trim(),
    status: 'PENDING',
  });

  // Notify coordinator
  if (cls.coordinator) {
    try {
      await createNotificationWithPreferences({
        recipient: String(cls.coordinator),
        type: 'GENERAL',
        title: 'Shift Request Received',
        message: `Tutor has requested to shift cycle ${cycleNumber} sessions by ${shiftDays > 0 ? '+' : ''}${shiftDays} day(s). Reason: ${reason.trim()}`,
      });
    } catch (e) {
      // non-fatal
    }
  }

  return request;
};

export const approveShiftRequest = async (params: {
  requestId: string;
  coordinatorId: string;
}) => {
  const { requestId, coordinatorId } = params;

  const request: any = await ShiftRequest.findById(requestId).populate('finalClass');
  if (!request) throw new ErrorResponse('Shift request not found', 404);
  if (request.status !== 'PENDING') throw new ErrorResponse('Request is no longer pending', 400);

  const cls: any = request.finalClass;
  if (String(cls.coordinator) !== coordinatorId) {
    throw new ErrorResponse('Only the assigned coordinator can approve this request', 403);
  }

  // Apply shift to PLANNED sessions
  const shifted = await applyShiftToPlannedSessions({
    classId: String(cls._id),
    cycleNumber: request.cycleNumber,
    shiftDays: request.shiftDays,
  });

  request.status = 'APPROVED';
  request.approvedBy = new mongoose.Types.ObjectId(coordinatorId);
  request.approvedAt = new Date();
  request.appliedAt = new Date();
  await request.save();

  // Notify tutor
  try {
    await createNotificationWithPreferences({
      recipient: String(cls.tutor),
      type: 'GENERAL',
      title: 'Shift Request Approved',
      message: `Your request to shift cycle ${request.cycleNumber} sessions by ${request.shiftDays > 0 ? '+' : ''}${request.shiftDays} day(s) has been approved. ${shifted.length} session(s) updated.`,
    });
  } catch (e) {
    // non-fatal
  }

  return { request, shiftedCount: shifted.length };
};

export const rejectShiftRequest = async (params: {
  requestId: string;
  coordinatorId: string;
  rejectionReason?: string;
}) => {
  const { requestId, coordinatorId, rejectionReason } = params;

  const request: any = await ShiftRequest.findById(requestId).populate('finalClass');
  if (!request) throw new ErrorResponse('Shift request not found', 404);
  if (request.status !== 'PENDING') throw new ErrorResponse('Request is no longer pending', 400);

  const cls: any = request.finalClass;
  if (String(cls.coordinator) !== coordinatorId) {
    throw new ErrorResponse('Only the assigned coordinator can reject this request', 403);
  }

  request.status = 'REJECTED';
  request.approvedBy = new mongoose.Types.ObjectId(coordinatorId);
  request.approvedAt = new Date();
  request.rejectionReason = rejectionReason?.trim();
  await request.save();

  // Notify tutor
  try {
    await createNotificationWithPreferences({
      recipient: String(cls.tutor),
      type: 'GENERAL',
      title: 'Shift Request Rejected',
      message: `Your shift request for cycle ${request.cycleNumber} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    });
  } catch (e) {
    // non-fatal
  }

  return request;
};

export const getShiftRequestsForClass = async (finalClassId: string) => {
  return ShiftRequest.find({ finalClass: finalClassId })
    .populate('requestedBy', 'name email')
    .populate('approvedBy', 'name email')
    .sort({ createdAt: -1 });
};

export const getPendingRequestsForCoordinator = async (coordinatorId: string) => {
  const classes = await FinalClass.find({ coordinator: coordinatorId }).select('_id');
  const classIds = classes.map((c: any) => c._id);
  return ShiftRequest.find({ finalClass: { $in: classIds }, status: 'PENDING' })
    .populate('finalClass', 'className studentName schedule classesPerMonth')
    .populate('requestedBy', 'name email')
    .sort({ createdAt: -1 });
};

export const getShiftRequestsForTutor = async (tutorId: string) => {
  return ShiftRequest.find({ requestedBy: tutorId })
    .populate('finalClass', 'className studentName schedule classesPerMonth')
    .sort({ createdAt: -1 });
};
