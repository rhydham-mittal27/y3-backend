import mongoose from 'mongoose';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import User from '../models/User';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { ATTENDANCE_STATUS, FINAL_CLASS_STATUS, STUDENT_ATTENDANCE_STATUS } from '../config/constants';
import { createPayment } from './paymentService';
import logger from '../utils/logger';

export const createAttendance = async (params: {
  finalClassId: string;
  sessionDate: Date;
  sessionNumber?: number;
  notes?: string;
  studentAttendanceStatus?: string;
  submittedBy: string;
}) => {
  const { finalClassId, sessionDate, sessionNumber, notes, studentAttendanceStatus, submittedBy } = params;

  const cls = await FinalClass.findById(finalClassId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (String(cls.status) !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Class must be ACTIVE to create attendance', 400);
  }

  const existing = await Attendance.findOne({ finalClass: finalClassId, sessionDate: new Date(sessionDate) });
  if (existing) throw new ErrorResponse('Attendance already exists for this date', 409);

  const attendance = await Attendance.create({
    finalClass: cls._id,
    sessionDate: new Date(sessionDate),
    sessionNumber,
    tutor: cls.tutor,
    coordinator: cls.coordinator,
    parent: (cls as any).parent,
    status: ATTENDANCE_STATUS.PENDING,
    studentAttendanceStatus: studentAttendanceStatus || STUDENT_ATTENDANCE_STATUS.PRESENT,
    submittedBy: new mongoose.Types.ObjectId(submittedBy),
    notes,
  });

  await attendance.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'submittedBy', select: 'name email' },
  ]);

  return attendance;
};

export const getAllAttendance = async (args: {
  page: number;
  limit: number;
  finalClassId?: string;
  status?: ATTENDANCE_STATUS | string;
  tutorId?: string;
  coordinatorId?: string;
  parentId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, finalClassId, status, tutorId, coordinatorId, parentId, fromDate, toDate, sortBy, sortOrder } = args;
  const query: any = {};
  if (finalClassId) query.finalClass = new mongoose.Types.ObjectId(finalClassId);
  if (status) query.status = status;
  if (tutorId) query.tutor = new mongoose.Types.ObjectId(tutorId);
  if (coordinatorId) query.coordinator = new mongoose.Types.ObjectId(coordinatorId);
  if (parentId) query.parent = new mongoose.Types.ObjectId(parentId);
  if (fromDate || toDate) {
    query.sessionDate = {};
    if (fromDate) query.sessionDate.$gte = new Date(fromDate);
    if (toDate) query.sessionDate.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'sessionDate';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [attendances, total] = await Promise.all([
    Attendance.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'finalClass' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'coordinator', select: 'name email phone' },
        { path: 'parent', select: 'name email phone' },
        { path: 'submittedBy', select: 'name email' },
        { path: 'coordinatorApprovedBy', select: 'name email' },
        { path: 'parentApprovedBy', select: 'name email' },
        { path: 'rejectedBy', select: 'name email' },
      ]),
    Attendance.countDocuments(query),
  ]);

  return { attendances, total, page, limit };
};

export const getAttendanceById = async (attendanceId: string) => {
  const attendance = await Attendance.findById(attendanceId).populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'submittedBy', select: 'name email' },
    { path: 'coordinatorApprovedBy', select: 'name email' },
    { path: 'parentApprovedBy', select: 'name email' },
    { path: 'rejectedBy', select: 'name email' },
  ]);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  return attendance;
};

export const coordinatorApprove = async (attendanceId: string, coordinatorUserId: string) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (String(attendance.status) !== ATTENDANCE_STATUS.PENDING) {
    throw new ErrorResponse('Attendance must be in PENDING status', 400);
  }
  if (String(attendance.coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to approve this attendance', 403);
  }

  attendance.status = ATTENDANCE_STATUS.COORDINATOR_APPROVED;
  attendance.coordinatorApprovedBy = new mongoose.Types.ObjectId(coordinatorUserId) as any;
  attendance.coordinatorApprovedAt = new Date();
  await attendance.save();

  // Notify parent if exists
  if (attendance.parent) {
    await Notification.create({
      recipient: attendance.parent,
      type: 'ATTENDANCE',
      title: 'Attendance Approval Required',
      message: `Please review and approve attendance for session on ${new Date(attendance.sessionDate).toDateString()}.`,
    });
  }

  await attendance.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'submittedBy', select: 'name email' },
    { path: 'coordinatorApprovedBy', select: 'name email' },
  ]);

  return attendance;
};

export const parentApprove = async (attendanceId: string, parentUserId: string) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const attendance = await Attendance.findById(attendanceId).session(session);
    if (!attendance) throw new ErrorResponse('Attendance not found', 404);
    if (String(attendance.status) !== ATTENDANCE_STATUS.COORDINATOR_APPROVED) {
      throw new ErrorResponse('Attendance must be coordinator-approved first', 400);
    }
    if (String(attendance.parent) !== String(parentUserId)) {
      throw new ErrorResponse('Not authorized to approve this attendance', 403);
    }

    attendance.status = ATTENDANCE_STATUS.PARENT_APPROVED as any;
    attendance.parentApprovedBy = new mongoose.Types.ObjectId(parentUserId) as any;
    attendance.parentApprovedAt = new Date();
    await attendance.save({ session });

    // Increment class completed sessions optionally
    await FinalClass.findByIdAndUpdate(attendance.finalClass, { $inc: { completedSessions: 1 } }, { session });

    await session.commitTransaction();

    try {
      await createPayment(attendanceId, parentUserId);
    } catch (e) {
      logger.error(`Payment creation failed for attendance ${attendanceId}: ${String(e)}`);
    }

    // Notify tutor
    await Notification.create({
      recipient: attendance.tutor,
      type: 'ATTENDANCE',
      title: 'Attendance Approved',
      message: `Attendance for session on ${new Date(attendance.sessionDate).toDateString()} has been approved by parent.`,
    });

    await attendance.populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'parentApprovedBy', select: 'name email' },
    ]);

    return attendance;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const rejectAttendance = async (attendanceId: string, rejectedByUserId: string, rejectionReason: string) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (![ATTENDANCE_STATUS.PENDING, ATTENDANCE_STATUS.COORDINATOR_APPROVED].includes(attendance.status as any)) {
    throw new ErrorResponse('Cannot reject already approved/rejected attendance', 400);
  }
  const isCoordinator = String(attendance.coordinator) === String(rejectedByUserId);
  const isParent = attendance.parent && String(attendance.parent) === String(rejectedByUserId);
  if (!isCoordinator && !isParent) {
    throw new ErrorResponse('Not authorized to reject this attendance', 403);
  }

  attendance.status = ATTENDANCE_STATUS.REJECTED as any;
  attendance.rejectedBy = new mongoose.Types.ObjectId(rejectedByUserId) as any;
  attendance.rejectedAt = new Date();
  attendance.rejectionReason = rejectionReason;
  await attendance.save();

  await Notification.create({
    recipient: attendance.tutor,
    type: 'ATTENDANCE',
    title: 'Attendance Rejected',
    message: `Attendance for session on ${new Date(attendance.sessionDate).toDateString()} was rejected: ${rejectionReason}`,
  });

  await attendance.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'rejectedBy', select: 'name email' },
  ]);

  return attendance;
};

export const updateAttendance = async (
  attendanceId: string,
  updateData: Partial<{ sessionDate: Date; sessionNumber: number; notes: string; studentAttendanceStatus: string }>
) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (String(attendance.status) !== ATTENDANCE_STATUS.PENDING) {
    throw new ErrorResponse('Cannot update approved/rejected attendance', 400);
  }
  if (updateData.sessionDate) attendance.sessionDate = new Date(updateData.sessionDate);
  if (typeof updateData.sessionNumber !== 'undefined') attendance.sessionNumber = updateData.sessionNumber;
  if (typeof updateData.notes !== 'undefined') attendance.notes = updateData.notes;
  if (typeof updateData.studentAttendanceStatus !== 'undefined') {
    attendance.studentAttendanceStatus = updateData.studentAttendanceStatus as any;
  }
  await attendance.save();

  await attendance.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
  ]);

  return attendance;
};

export const deleteAttendance = async (attendanceId: string) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (String(attendance.status) !== ATTENDANCE_STATUS.PENDING) {
    throw new ErrorResponse('Cannot delete approved attendance', 400);
  }
  await Attendance.findByIdAndDelete(attendanceId);
  return { success: true };
};

export const getAttendanceByClass = async (finalClassId: string, status?: ATTENDANCE_STATUS | string) => {
  const query: any = { finalClass: new mongoose.Types.ObjectId(finalClassId) };
  if (status) query.status = status;
  const attendances = await Attendance.find(query)
    .sort({ sessionDate: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'submittedBy', select: 'name email' },
    ]);
  return attendances;
};

export const getAttendanceHistory = async (finalClassId: string) => {
  const attendances = await Attendance.find({ finalClass: new mongoose.Types.ObjectId(finalClassId) })
    .sort({ sessionDate: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
    ]);

  const total = attendances.length;
  const approvedCount = attendances.filter((a) => String(a.status) === ATTENDANCE_STATUS.PARENT_APPROVED).length;
  const pendingCount = attendances.filter((a) => String(a.status) === ATTENDANCE_STATUS.PENDING).length;
  const rejectedCount = attendances.filter((a) => String(a.status) === ATTENDANCE_STATUS.REJECTED).length;
  const approvalRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

  return {
    attendances,
    statistics: { totalSessions: total, approvedCount, pendingCount, rejectedCount, approvalRate },
  };
};

export const getPendingApprovalsForCoordinator = async (coordinatorUserId: string) => {
  const attendances = await Attendance.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId), status: ATTENDANCE_STATUS.PENDING })
    .sort({ sessionDate: 1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
    ]);
  return attendances;
};

export const getPendingApprovalsForParent = async (parentUserId: string) => {
  const attendances = await Attendance.find({ parent: new mongoose.Types.ObjectId(parentUserId), status: ATTENDANCE_STATUS.COORDINATOR_APPROVED })
    .sort({ sessionDate: 1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
    ]);
  return attendances;
};

export default {
  createAttendance,
  getAllAttendance,
  getAttendanceById,
  coordinatorApprove,
  parentApprove,
  rejectAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceByClass,
  getAttendanceHistory,
  getPendingApprovalsForCoordinator,
  getPendingApprovalsForParent,
};
