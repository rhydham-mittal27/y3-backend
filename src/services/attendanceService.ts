import mongoose from 'mongoose';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import Coordinator from '../models/Coordinator';
import ErrorResponse from '../utils/errorResponse';
import { ATTENDANCE_STATUS, FINAL_CLASS_STATUS, STUDENT_ATTENDANCE_STATUS } from '../config/constants';
import { createPayment } from './paymentService';
import logger from '../utils/logger';
import { createNotificationWithPreferences } from './notificationService';
import { upsertAttendanceSheet, submitAttendanceSheet } from './attendanceSheetService';

export const createAttendance = async (params: {
  finalClassId: string;
  sessionDate: Date;
  sessionNumber?: number;
  topicCovered?: string;
  notes?: string;
  studentAttendanceStatus?: string;
  submittedBy: string;
}) => {
  const { finalClassId, sessionDate, sessionNumber, topicCovered, notes, studentAttendanceStatus, submittedBy } = params;

  const cls = await FinalClass.findById(finalClassId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (String(cls.status) !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Class must be ACTIVE to create attendance', 400);
  }

  // Optionally enforce that attendance can only be marked on today's date
  const requestedDate = new Date(sessionDate);
  const today = new Date();
  const normalize = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd.getTime();
  };
  let sameDayOnly = true;
  try {
    const coord = await Coordinator.findOne({ user: cls.coordinator as any });
    if (coord && (coord as any).settings?.attendanceControls) {
      const flag = (coord as any).settings.attendanceControls.sameDayOnly;
      if (typeof flag === 'boolean') sameDayOnly = flag;
    }
  } catch {}

  if (sameDayOnly && normalize(requestedDate) !== normalize(today)) {
    throw new ErrorResponse('Attendance can only be marked for today\'s date', 400);
  }

  // Check one-time reschedules: allow attendance on target dates (toDate),
  // and treat original dates (fromDate) as moved away when toDate differs.
  const reschedules: any[] = ((cls as any).oneTimeReschedules || []).map((r: any) => ({ ...r }));
  const hasTodayRescheduleTarget = reschedules.some((r) => normalize(new Date(r.toDate)) === normalize(today));
  const isMovedFromToday = reschedules.some(
    (r) => normalize(new Date(r.fromDate)) === normalize(today) && normalize(new Date(r.toDate)) !== normalize(new Date(r.fromDate))
  );

  if (isMovedFromToday && !hasTodayRescheduleTarget) {
    throw new ErrorResponse('This session has been rescheduled to another date', 400);
  }

  // Additionally, if there is NO one-time reschedule target, ensure that today is one of the scheduled days
  // for this class (if a recurring schedule exists)
  if (!hasTodayRescheduleTarget) {
    const schedule: any = (cls as any).schedule;
    if (schedule && Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0) {
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayDayName = dayNames[today.getDay()];
      if (!schedule.daysOfWeek.includes(todayDayName)) {
        throw new ErrorResponse('Attendance can only be marked on a scheduled class day', 400);
      }
    }
  }

  const existing = await Attendance.findOne({ finalClass: finalClassId, sessionDate: new Date(sessionDate) });
  if (existing) throw new ErrorResponse('Attendance already exists for this date', 409);

  const attendance = await Attendance.create({
    finalClass: cls._id,
    sessionDate: new Date(sessionDate),
    sessionNumber,
    topicCovered,
    tutor: cls.tutor,
    coordinator: cls.coordinator,
    parent: (cls as any).parent,
    status: ATTENDANCE_STATUS.APPROVED,
    studentAttendanceStatus: studentAttendanceStatus || STUDENT_ATTENDANCE_STATUS.PRESENT,
    submittedBy: new mongoose.Types.ObjectId(submittedBy),
    notes,
  });

  // Since attendance is auto-approved in the new flow, increment completed sessions for this class
  const updatedClass = await FinalClass.findByIdAndUpdate(
    cls._id,
    { $inc: { completedSessions: 1 } },
    { new: true }
  );

  // If this attendance completes all planned sessions for the class, auto-generate and submit
  // a monthly attendance sheet for the month of this session.
  try {
    const totalSessions = (updatedClass as any)?.totalSessions || cls.totalSessions || 0;
    const completedSessions = (updatedClass as any)?.completedSessions || (cls.completedSessions || 0) + 1;
    if (totalSessions > 0 && completedSessions >= totalSessions) {
      const sessionDt = new Date(sessionDate);
      const month = sessionDt.getMonth() + 1;
      const year = sessionDt.getFullYear();

      const sheet = await upsertAttendanceSheet({
        finalClassId,
        month,
        year,
        createdByUserId: submittedBy,
      });

      if (sheet && (sheet as any)._id) {
        await submitAttendanceSheet(String((sheet as any)._id), submittedBy);
      }
    }
  } catch (e) {
    logger.error(`Failed to auto-generate/submit attendance sheet for class ${finalClassId}: ${String(e)}`);
  }

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
    await createNotificationWithPreferences({
      recipient: attendance.parent as any,
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

    // Do not allow approving sessions that are in the future
    if (attendance.sessionDate) {
      const sessionDate = new Date(attendance.sessionDate);
      const today = new Date();
      sessionDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      if (sessionDate.getTime() > today.getTime()) {
        throw new ErrorResponse('Cannot approve attendance for a future session date', 400);
      }
    }

    // Enforce that the class has completed all planned sessions before parent approvals
    const cls = await FinalClass.findById(attendance.finalClass).select('totalSessions completedSessions');
    if (!cls) {
      throw new ErrorResponse('Class not found for attendance', 404);
    }
    const totalSessions = cls.totalSessions || 0;
    const completedSessions = cls.completedSessions || 0;
    if (totalSessions > 0 && completedSessions < totalSessions) {
      throw new ErrorResponse('Attendance can only be verified after all planned sessions are completed for this class', 400);
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
    await createNotificationWithPreferences({
      recipient: attendance.tutor as any,
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

  await createNotificationWithPreferences({
    recipient: attendance.tutor as any,
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
  updateData: Partial<{ sessionDate: Date; sessionNumber: number; topicCovered: string; notes: string; studentAttendanceStatus: string }>
) => {
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (String(attendance.status) !== ATTENDANCE_STATUS.PENDING) {
    throw new ErrorResponse('Cannot update approved/rejected attendance', 400);
  }
  if (updateData.sessionDate) attendance.sessionDate = new Date(updateData.sessionDate);
  if (typeof updateData.sessionNumber !== 'undefined') attendance.sessionNumber = updateData.sessionNumber;
  if (typeof updateData.topicCovered !== 'undefined') attendance.topicCovered = updateData.topicCovered;
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
      {
        path: 'finalClass',
        populate: { path: 'classLead', select: 'classDurationHours' },
      },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'submittedBy', select: 'name email' },
    ]);
  return attendances;
};

export const getTutorAttendanceSummary = async (tutorUserId: string) => {
  if (!mongoose.isValidObjectId(tutorUserId)) {
    return [];
  }

  const tutorObjectId = new mongoose.Types.ObjectId(tutorUserId);

  const agg = await Attendance.aggregate([
    { $match: { tutor: tutorObjectId } },
    {
      $group: {
        _id: '$finalClass',
        totalSessionsTaken: { $sum: 1 },
        presentCount: {
          $sum: {
            $cond: [
              { $eq: ['$studentAttendanceStatus', STUDENT_ATTENDANCE_STATUS.PRESENT] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const classIds = agg.map((a: any) => a._id).filter(Boolean);
  if (!classIds.length) return [];

  const classes = await FinalClass.find({ _id: { $in: classIds } }).select('className studentName');
  const classMap: Record<string, any> = {};
  classes.forEach((c: any) => {
    classMap[String(c._id)] = c;
  });

  return agg
    .map((row: any) => {
      const cls = classMap[String(row._id)];
      if (!cls) return null;
      return {
        classId: String(row._id),
        className: cls.className || '',
        studentName: cls.studentName || '',
        totalSessionsTaken: row.totalSessionsTaken || 0,
        presentCount: row.presentCount || 0,
      };
    })
    .filter(Boolean);
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
  const approvedCount = attendances.filter((a) =>
    String(a.status) === ATTENDANCE_STATUS.PARENT_APPROVED ||
    String(a.status) === ATTENDANCE_STATUS.APPROVED
  ).length;
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendances = await Attendance.find({
    parent: new mongoose.Types.ObjectId(parentUserId),
    status: ATTENDANCE_STATUS.COORDINATOR_APPROVED,
    sessionDate: { $lte: today },
  })
    .sort({ sessionDate: 1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
    ]);
  // Only show records where the related class has completed all planned sessions
  return attendances.filter((a: any) => {
    const cls: any = a.finalClass;
    if (!cls) return false;
    const totalSessions = cls.totalSessions || 0;
    const completedSessions = cls.completedSessions || 0;
    if (totalSessions <= 0) return true; // if not configured, do not block
    return completedSessions >= totalSessions;
  });
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
  getTutorAttendanceSummary,
};
