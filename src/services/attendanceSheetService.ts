import mongoose from 'mongoose';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import AttendanceSheet from '../models/AttendanceSheet';
import ErrorResponse from '../utils/errorResponse';

export const upsertAttendanceSheet = async (params: {
  finalClassId: string;
  month: number;
  year: number;
  createdByUserId: string;
}) => {
  const { finalClassId, month, year, createdByUserId } = params;

  if (!mongoose.isValidObjectId(finalClassId)) {
    throw new ErrorResponse('Invalid class id', 400);
  }

  const finalClass = await FinalClass.findById(finalClassId);
  if (!finalClass) {
    throw new ErrorResponse('Final class not found', 404);
  }

  if (!finalClass.coordinator) {
    throw new ErrorResponse('Class does not have an assigned coordinator', 400);
  }

  const classObjectId = new mongoose.Types.ObjectId(finalClassId);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const attendances = await Attendance.find({
    finalClass: classObjectId,
    sessionDate: { $gte: start, $lte: end },
  }).sort({ sessionDate: 1 });

  const attendanceIds = attendances.map((a) => a._id);

  const totalSessionsTaken = attendances.length;
  const presentCount = attendances.filter((a: any) => String(a.studentAttendanceStatus) === 'PRESENT').length;
  const absentCount = attendances.filter((a: any) => String(a.studentAttendanceStatus) === 'ABSENT').length;

  const totalSessionsPlanned = finalClass.totalSessions || 0;

  const periodLabel = `${year}-${String(month).padStart(2, '0')}`;

  const existing = await AttendanceSheet.findOne({
    finalClass: classObjectId,
    month,
    year,
  });

  if (!existing) {
    const sheet = await AttendanceSheet.create({
      finalClass: classObjectId,
      coordinator: finalClass.coordinator,
      month,
      year,
      periodLabel,
      attendanceIds,
      totalSessionsPlanned,
      totalSessionsTaken,
      presentCount,
      absentCount,
      status: 'DRAFT',
      createdBy: new mongoose.Types.ObjectId(createdByUserId),
    });

    return sheet;
  }

  existing.attendanceIds = attendanceIds;
  existing.totalSessionsPlanned = totalSessionsPlanned;
  existing.totalSessionsTaken = totalSessionsTaken;
  existing.presentCount = presentCount;
  existing.absentCount = absentCount;
  existing.periodLabel = periodLabel;

  // Keep status as-is (e.g. APPROVED/REJECTED) unless it is still in DRAFT
  await existing.save();
  return existing;
};

export const submitAttendanceSheet = async (sheetId: string, userId: string) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);

  if (String(sheet.createdBy) !== String(userId)) {
    // allow also manager/admin later if needed
  }

  sheet.status = 'PENDING';
  sheet.submittedAt = new Date();
  await sheet.save();
  return sheet;
};

export const getCoordinatorPendingSheets = async (coordinatorUserId: string) => {
  if (!mongoose.isValidObjectId(coordinatorUserId)) {
    return [];
  }

  const attendances = await AttendanceSheet.find({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    status: 'PENDING',
  })
    .sort({ year: -1, month: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'coordinator', select: 'name email' },
    ]);

  return attendances;
};

export const approveAttendanceSheet = async (sheetId: string, coordinatorUserId: string) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  if (String(sheet.coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to approve this sheet', 403);
  }
  if (sheet.status !== 'PENDING') {
    throw new ErrorResponse('Sheet must be in PENDING status to approve', 400);
  }

  sheet.status = 'APPROVED';
  sheet.approvedBy = new mongoose.Types.ObjectId(coordinatorUserId);
  sheet.approvedAt = new Date();
  await sheet.save();
  return sheet;
};

export const rejectAttendanceSheet = async (sheetId: string, coordinatorUserId: string, reason: string) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  if (String(sheet.coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to reject this sheet', 403);
  }
  if (sheet.status !== 'PENDING') {
    throw new ErrorResponse('Sheet must be in PENDING status to reject', 400);
  }

  sheet.status = 'REJECTED';
  sheet.rejectedBy = new mongoose.Types.ObjectId(coordinatorUserId);
  sheet.rejectedAt = new Date();
  sheet.rejectionReason = reason;
  await sheet.save();
  return sheet;
};

export default {
  upsertAttendanceSheet,
  submitAttendanceSheet,
  getCoordinatorPendingSheets,
  approveAttendanceSheet,
  rejectAttendanceSheet,
};
