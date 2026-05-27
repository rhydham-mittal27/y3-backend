import mongoose from 'mongoose';
import Attendance from '../models/Attendance';
import AttendanceSheet from '../models/AttendanceSheet';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { ATTENDANCE_STATUS, FINAL_CLASS_STATUS, STUDENT_ATTENDANCE_STATUS } from '../config/constants';
import logger from '../utils/logger';
import { createNotificationWithPreferences } from './notificationService';
import { updateTutorExperienceAndTier } from './tutorService';

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

  // Enforce attendance submission window
  const requestedDate = new Date(sessionDate);
  const today = new Date();
  const normalize = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  const normalizedRequested = normalize(requestedDate);
  const windowDays = (cls as any).attendanceSubmissionWindow ?? 2;
  
  const deadlineDate = new Date(normalizedRequested);
  deadlineDate.setDate(deadlineDate.getDate() + windowDays);
  deadlineDate.setHours(23, 59, 59, 999);

  if (today > deadlineDate) {
    throw new ErrorResponse(`Attendance submission window has expired. This class allows submission within ${windowDays} day(s) of the session date.`, 400);
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


  const startOfDay = new Date(sessionDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(sessionDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existing = await Attendance.findOne({ 
    finalClass: finalClassId, 
    sessionDate: { 
        $gte: startOfDay, 
        $lte: endOfDay 
    } 
  });
  if (existing) throw new ErrorResponse('Attendance already exists for this date', 409);

  const attendance = await Attendance.create({
    finalClass: cls._id,
    sessionDate: new Date(sessionDate),
    sessionNumber,
    topicCovered,
    tutor: cls.tutor,
    coordinator: cls.coordinator,
    parent: (cls as any).parent,
    status: ATTENDANCE_STATUS.PARENT_APPROVED,
    studentAttendanceStatus: studentAttendanceStatus || STUDENT_ATTENDANCE_STATUS.PRESENT,
    submittedBy: new mongoose.Types.ObjectId(submittedBy),
    notes,
  });

  // Since attendance is auto-approved in the new flow, increment completed sessions for this class
  await FinalClass.findByIdAndUpdate(
    cls._id,
    { $inc: { completedSessions: 1 } },
    { new: true }
  );

  // If this attendance completes all planned sessions for the class, auto-generate and submit
  // a monthly attendance sheet logic is replaced by per-session sheet updates.
  // Legacy logic removed.

  // Update Tutor Experience & Tier logic
  try {
    await updateTutorExperienceAndTier(cls.tutor as any);
  } catch (err) {
    logger.error(`Failed to update tutor tier stats: ${err}`);
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

  const matchStage: any = {};
  if (finalClassId) matchStage.finalClass = new mongoose.Types.ObjectId(finalClassId);
  if (coordinatorId) matchStage.coordinator = new mongoose.Types.ObjectId(coordinatorId);
  // Sheet-level filters might not clear partial months if date range is specific, handled after unwind?
  // Actually, filtering sheets first is good for performance.
  
  // Create pipeline
  const pipeline: any[] = [
    { $match: matchStage },
    { $unwind: '$records' },
  ];

  // Record-level match
  const recordMatch: any = {};
  if (tutorId) recordMatch['records.tutor'] = new mongoose.Types.ObjectId(tutorId);
  if (status) recordMatch['records.status'] = status;
  if (parentId) {
      // Parent logic might be tricky if not stored on record. 
      // But typically parents query by class or student.
      // Ignoring parentId filter on record level for now unless it's on the sheet?
      // Old Attendance had 'parent'. New one doesn't seem to explicitly store 'parent' on record?
      // It stores 'tutor', 'submittedBy'.
  }
  
  if (fromDate || toDate) {
    recordMatch['records.sessionDate'] = {};
    if (fromDate) recordMatch['records.sessionDate'].$gte = new Date(fromDate);
    if (toDate) recordMatch['records.sessionDate'].$lte = new Date(toDate);
  }

  if (Object.keys(recordMatch).length > 0) {
    pipeline.push({ $match: recordMatch });
  }

  // Sort
  const sortField = sortBy ? `records.${sortBy}` : 'records.sessionDate';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  pipeline.push({ $sort: { [sortField]: sortDir } });

  // Facet for pagination
  pipeline.push({
    $facet: {
      attendances: [
        { $skip: (page - 1) * limit },
        { $limit: limit },
        // Lookup/Populate emulation
        {
            $lookup: {
                from: 'finalclasses',
                localField: 'finalClass',
                foreignField: '_id',
                as: 'finalClass'
            }
        },
        { $unwind: { path: '$finalClass', preserveNullAndEmptyArrays: true } },
        {
             $lookup: {
                 from: 'users',
                 localField: 'records.tutor',
                 foreignField: '_id',
                 as: 'tutor'
             }
        },
         { $unwind: { path: '$tutor', preserveNullAndEmptyArrays: true } },
        {
             $lookup: {
                 from: 'users',
                 localField: 'records.submittedBy',
                 foreignField: '_id',
                 as: 'submittedBy'
             }
        },
         { $unwind: { path: '$submittedBy', preserveNullAndEmptyArrays: true } },
         {
             $lookup: {
                 from: 'users',
                 localField: 'approvedBy',
                 foreignField: '_id',
                 as: 'approvedBy'
             }
         },
         { $unwind: { path: '$approvedBy', preserveNullAndEmptyArrays: true } },
         {
             $lookup: {
                 from: 'users',
                 localField: 'rejectedBy',
                 foreignField: '_id',
                 as: 'rejectedBy'
             }
         },
         { $unwind: { path: '$rejectedBy', preserveNullAndEmptyArrays: true } },
         {
             $project: {
                 _id: '$records._id', // Use record ID as the main ID
                 sheetId: '$_id',
                 finalClass: '$finalClass',
                 sessionDate: '$records.sessionDate',
                 durationHours: '$records.durationHours',
                 topicCovered: '$records.topicCovered',
                 studentAttendanceStatus: '$records.studentAttendanceStatus',
                 status: '$records.status',
                 notes: '$records.notes',
                 tutor: { _id: '$tutor._id', name: '$tutor.name', email: '$tutor.email' },
                 submittedBy: { _id: '$submittedBy._id', name: '$submittedBy.name', email: '$submittedBy.email' },
                 submittedAt: '$records.submittedAt',
                 coordinatorApprovedBy: { _id: '$approvedBy._id', name: '$approvedBy.name', email: '$approvedBy.email' },
                 coordinatorApprovedAt: '$approvedAt',
                 rejectedBy: { _id: '$rejectedBy._id', name: '$rejectedBy.name', email: '$rejectedBy.email' },
                 rejectedAt: '$rejectedAt',
                 rejectionReason: '$rejectionReason',
                 // Compatibility fields
                 sessionNumber: { $literal: 0 } // deprecated
             }
         }
      ],
      total: [{ $count: 'count' }]
    }
  });

  const result = await AttendanceSheet.aggregate(pipeline);
  
  const attendances = result[0].attendances;
  const total = result[0].total[0] ? result[0].total[0].count : 0;

  return { attendances, total, page, limit };
};

export const getAttendanceById = async (attendanceId: string) => {
  const pipeline: any[] = [
    { $match: { 'records._id': new mongoose.Types.ObjectId(attendanceId) } },
    { $unwind: '$records' },
    { $match: { 'records._id': new mongoose.Types.ObjectId(attendanceId) } },
    
    // Lookups
    {
        $lookup: {
            from: 'finalclasses',
            localField: 'finalClass',
            foreignField: '_id',
            as: 'finalClass'
        }
    },
    { $unwind: { path: '$finalClass', preserveNullAndEmptyArrays: true } },
    {
         $lookup: {
             from: 'users',
             localField: 'records.tutor',
             foreignField: '_id',
             as: 'tutor'
         }
    },
    { $unwind: { path: '$tutor', preserveNullAndEmptyArrays: true } },
    {
         $lookup: {
             from: 'users',
             localField: 'records.submittedBy',
             foreignField: '_id',
             as: 'submittedBy'
         }
    },
    { $unwind: { path: '$submittedBy', preserveNullAndEmptyArrays: true } },
    {
         $lookup: {
             from: 'users',
             localField: 'approvedBy',
             foreignField: '_id',
             as: 'approvedBy'
         }
    },
    { $unwind: { path: '$approvedBy', preserveNullAndEmptyArrays: true } },
    {
         $lookup: {
             from: 'users',
             localField: 'rejectedBy',
             foreignField: '_id',
             as: 'rejectedBy'
         }
    },
    { $unwind: { path: '$rejectedBy', preserveNullAndEmptyArrays: true } },
    // Project
    {
         $project: {
             _id: '$records._id',
             sheetId: '$_id',
             finalClass: '$finalClass',
             sessionDate: '$records.sessionDate',
             durationHours: '$records.durationHours',
             topicCovered: '$records.topicCovered',
             studentAttendanceStatus: '$records.studentAttendanceStatus',
             status: '$records.status',
             notes: '$records.notes',
             tutor: { _id: '$tutor._id', name: '$tutor.name', email: '$tutor.email', phone: '$tutor.phone' },
             submittedBy: { _id: '$submittedBy._id', name: '$submittedBy.name', email: '$submittedBy.email' },
             submittedAt: '$records.submittedAt',
             coordinatorApprovedBy: { _id: '$approvedBy._id', name: '$approvedBy.name', email: '$approvedBy.email' },
             coordinatorApprovedAt: '$approvedAt',
             rejectedBy: { _id: '$rejectedBy._id', name: '$rejectedBy.name', email: '$rejectedBy.email' },
             rejectedAt: '$rejectedAt',
             rejectionReason: '$rejectionReason'
         }
    }
  ];

  const results = await AttendanceSheet.aggregate(pipeline);
  if (!results.length) throw new ErrorResponse('Attendance not found', 404);
  return results[0];
};

export const coordinatorApprove = async (attendanceId: string, coordinatorUserId: string) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const attendance = await Attendance.findById(attendanceId).session(session);
    if (!attendance) throw new ErrorResponse('Attendance not found', 404);
    if (String(attendance.status) !== ATTENDANCE_STATUS.PENDING) {
      throw new ErrorResponse('Attendance must be in PENDING status', 400);
    }
    if (String(attendance.coordinator) !== String(coordinatorUserId)) {
      throw new ErrorResponse('Not authorized to approve this attendance', 403);
    }

    // Set status directly to PARENT_APPROVED to finalize it immediately
    attendance.status = ATTENDANCE_STATUS.PARENT_APPROVED;
    attendance.coordinatorApprovedBy = new mongoose.Types.ObjectId(coordinatorUserId) as any;
    attendance.coordinatorApprovedAt = new Date();
    
    await attendance.save({ session });

    // Increment class completed sessions
    await FinalClass.findByIdAndUpdate(attendance.finalClass, { $inc: { completedSessions: 1 } }, { session });

    await session.commitTransaction();

    // Notify tutor immediately that the session is approved
    try {
      await createNotificationWithPreferences({
        recipient: attendance.tutor as any,
        type: 'ATTENDANCE',
        title: 'Attendance Approved',
        message: `Attendance for session on ${new Date(attendance.sessionDate).toDateString()} has been approved.`,
      });
    } catch (e) {
      logger.error(`Failed to notify tutor: ${e}`);
    }

    // Update Tutor Experience & Tier logic
    try {
      await updateTutorExperienceAndTier((attendance.tutor as any)._id || attendance.tutor);
    } catch (err) {
      logger.error(`Failed to update tutor tier stats upon coordinator approval: ${err}`);
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
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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

    // Notify tutor
    await createNotificationWithPreferences({
      recipient: attendance.tutor as any,
      type: 'ATTENDANCE',
      title: 'Attendance Approved',
      message: `Attendance for session on ${new Date(attendance.sessionDate).toDateString()} has been approved by parent.`,
    });

    // Update Tutor Experience & Tier logic
    try {
        await updateTutorExperienceAndTier((attendance.tutor as any)._id || attendance.tutor);
    } catch (err) {
        logger.error(`Failed to update tutor tier stats upon parent approval: ${err}`);
    }

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
  const matchStage: any = { finalClass: new mongoose.Types.ObjectId(finalClassId) };
  
  const pipeline: any[] = [
    { $match: matchStage },
    { $unwind: '$records' }
  ];

  if (status) {
    pipeline.push({ $match: { 'records.status': status } });
  }

  pipeline.push({ $sort: { 'records.sessionDate': -1 } });
  
  // Lookups similar to getAllAttendance
  pipeline.push(
      {
        $lookup: {
            from: 'finalclasses',
            localField: 'finalClass',
            foreignField: '_id',
            as: 'finalClass'
        }
      },
      { $unwind: { path: '$finalClass', preserveNullAndEmptyArrays: true } },
      // Tutor lookup
      {
         $lookup: {
             from: 'users',
             localField: 'records.tutor',
             foreignField: '_id',
             as: 'tutor'
         }
      },
      { $unwind: { path: '$tutor', preserveNullAndEmptyArrays: true } },
      {
         $lookup: {
             from: 'users',
             localField: 'records.submittedBy',
             foreignField: '_id',
             as: 'submittedBy'
         }
      },
      { $unwind: { path: '$submittedBy', preserveNullAndEmptyArrays: true } },
      {
         $lookup: {
             from: 'users',
             localField: 'approvedBy',
             foreignField: '_id',
             as: 'approvedBy'
         }
      },
      { $unwind: { path: '$approvedBy', preserveNullAndEmptyArrays: true } },
      {
         $lookup: {
             from: 'users',
             localField: 'rejectedBy',
             foreignField: '_id',
             as: 'rejectedBy'
         }
      },
      { $unwind: { path: '$rejectedBy', preserveNullAndEmptyArrays: true } },
      // Project to flatten
      {
         $project: {
             _id: '$records._id',
             sheetId: '$_id',
             finalClass: '$finalClass',
             sessionDate: '$records.sessionDate',
             durationHours: '$records.durationHours',
             topicCovered: '$records.topicCovered',
             studentAttendanceStatus: '$records.studentAttendanceStatus',
             status: '$records.status',
             notes: '$records.notes',
             tutor: { _id: '$tutor._id', name: '$tutor.name', email: '$tutor.email', phone: '$tutor.phone' },
             submittedBy: { _id: '$submittedBy._id', name: '$submittedBy.name', email: '$submittedBy.email' },
             submittedAt: '$records.submittedAt',
             coordinatorApprovedBy: { _id: '$approvedBy._id', name: '$approvedBy.name', email: '$approvedBy.email' },
             coordinatorApprovedAt: '$approvedAt',
             rejectedBy: { _id: '$rejectedBy._id', name: '$rejectedBy.name', email: '$rejectedBy.email' },
             rejectedAt: '$rejectedAt',
             rejectionReason: '$rejectionReason'
         }
      }
  );

  return await AttendanceSheet.aggregate(pipeline);
};

export const getTutorAttendanceSummary = async (tutorUserId: string) => {
  if (!mongoose.isValidObjectId(tutorUserId)) {
    return [];
  }

  const tutorObjectId = new mongoose.Types.ObjectId(tutorUserId);

  // Find all classes for this tutor
  const tutorClasses = await FinalClass.find({ tutor: tutorObjectId }).select('_id');
  const tutorClassIds = tutorClasses.map(c => c._id);

  if (tutorClassIds.length === 0) return [];

  const agg = await AttendanceSheet.aggregate([
    { $match: { finalClass: { $in: tutorClassIds } } },
    {
      $group: {
        _id: '$finalClass',
        totalSessionsTaken: { $sum: '$totalSessionsTaken' },
        presentCount: { $sum: '$presentCount' },
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
  // Use getAttendanceByClass to fetch flattened records
  const attendances: any[] = await getAttendanceByClass(finalClassId);

  // Stats calculation
  const total = attendances.length;
  const approvedCount = attendances.filter((a) =>
    String(a.status) === ATTENDANCE_STATUS.APPROVED || // New simplified status
    String(a.status) === ATTENDANCE_STATUS.PARENT_APPROVED // Legacy/Compat
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
