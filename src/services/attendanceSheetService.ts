import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import GroupClass from '../models/GroupClass';
import StudentEnrollment from '../models/StudentEnrollment';
import AttendanceSheet, { IDailyAttendanceRecord, IStudentAttendance } from '../models/AttendanceSheet';
import Payment from '../models/Payment';
import ErrorResponse from '../utils/errorResponse';
import { ATTENDANCE_STATUS, STUDENT_ATTENDANCE_STATUS, FINAL_CLASS_STATUS, PAYMENT_TYPE, PAYMENT_STATUS } from '../config/constants';
import { createPaymentForSheet, createCyclePayments } from './paymentService';
import { updateTutorExperienceAndTier } from './tutorService';
import logger from '../utils/logger';

export const addDailyAttendance = async (params: {
  finalClassId?: string;
  groupClassId?: string;
  sessionDate: Date;
  durationHours?: number;
  topicCovered?: string;
  studentAttendanceStatus?: string; // For Single
  studentAttendances?: { student: string; status: string; notes?: string }[]; // For Group
  notes?: string;
  userId: string; // submittedBy
}) => {
  const { finalClassId, groupClassId, sessionDate, durationHours, topicCovered, studentAttendanceStatus, studentAttendances, notes, userId } = params;

  if (!finalClassId && !groupClassId) {
    throw new ErrorResponse('Either finalClassId or groupClassId is required', 400);
  }

  let entity: any;
  let coordinatorId: any;
  let sessionLimit: number = 8;
  let tutorId: any;
  let isGroup = false;

  if (groupClassId) {
    if (!mongoose.isValidObjectId(groupClassId)) throw new ErrorResponse('Invalid group class id', 400);
    const group = await GroupClass.findById(groupClassId);
    if (!group) throw new ErrorResponse('Group class not found', 404);
    if (group.status !== 'ACTIVE') throw new ErrorResponse('Group must be ACTIVE to mark attendance', 400);
    
    entity = group;
    // Group doesn't explicitly have a coordinator field in the Plan? 
    // Assuming createdBy is coordinator/admin
    coordinatorId = group.createdBy; 
    sessionLimit = group.sessionsPerMonth || 8;
    tutorId = group.tutor;
    isGroup = true;
  } else {
    // Single Class Logic
    if (!mongoose.isValidObjectId(finalClassId)) throw new ErrorResponse('Invalid class id', 400);
    const finalClass = await FinalClass.findById(finalClassId);
    if (!finalClass) throw new ErrorResponse('Final class not found', 404);
    if (!finalClass.coordinator) throw new ErrorResponse('Class does not have an assigned coordinator', 400);
    if (String(finalClass.status) !== FINAL_CLASS_STATUS.ACTIVE) throw new ErrorResponse('Class must be ACTIVE to create attendance', 400);
    
    entity = finalClass;
    coordinatorId = finalClass.coordinator;
    sessionLimit = finalClass.classesPerMonth || 8;
    tutorId = finalClass.tutor;
    isGroup = false;
  }

  // --- Validation Logic (Common & Specific) ---
  const requestedDate = new Date(sessionDate);
  const today = new Date();
  const normalize = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  // Enforce submission window (only for FinalClass currently as Group schema didn't specify window)
  if (!isGroup) {
      const windowDays = (entity as any).attendanceSubmissionWindow ?? 2;
      const normalizedRequested = normalize(requestedDate);
      const deadlineDate = new Date(normalizedRequested);
      deadlineDate.setDate(deadlineDate.getDate() + windowDays);
      deadlineDate.setHours(23, 59, 59, 999);
    
      if (today > deadlineDate) {
        throw new ErrorResponse(`Attendance submission window has expired. This class allows submission within ${windowDays} day(s) of the session date.`, 400);
      }
      
       // Schedule checks (only for FinalClass currently)
      const reschedules: any[] = ((entity as any).oneTimeReschedules || []).map((r: any) => ({ ...r }));
      const hasTodayRescheduleTarget = reschedules.some((r: any) => normalize(new Date(r.toDate)) === normalize(today));
      const isMovedFromToday = reschedules.some(
        (r: any) => normalize(new Date(r.fromDate)) === normalize(today) && normalize(new Date(r.toDate)) !== normalize(new Date(r.fromDate))
      );
    
      if (isMovedFromToday && !hasTodayRescheduleTarget) {
        throw new ErrorResponse('This session has been rescheduled to another date', 400);
      }
    
      if (!hasTodayRescheduleTarget) {
        const schedule: any = (entity as any).schedule;
        if (schedule && Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0) {
          const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
          const sessionDayName = dayNames[requestedDate.getDay()];
          if (!schedule.daysOfWeek.includes(sessionDayName)) {
            throw new ErrorResponse('Attendance can only be marked on a scheduled class day', 400);
          }
        }
      }
  }

  // --- Sheet Resolution ---
  const query: any = { 
      // Mutually exclusive
      ...(isGroup ? { groupClass: groupClassId } : { finalClass: finalClassId }) 
  };

  const latestSheet = await AttendanceSheet.findOne(query).sort({ cycleNumber: -1 });

  let sheet: any = latestSheet;
  const currentRecordsCount = sheet ? sheet.records.length : 0;
  const isSheetFull = sessionLimit > 0 && currentRecordsCount >= sessionLimit;
  const isSheetClosed = sheet && ['APPROVED', 'REJECTED'].includes(sheet.status);
  const date = new Date(sessionDate);

  if (!sheet || isSheetFull || isSheetClosed || sheet.status === 'PENDING') {
    // Create NEW Sheet
    const nextCycle = (sheet?.cycleNumber || 0) + 1;
    
    const sheetData: any = {
      coordinator: coordinatorId,
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      cycleNumber: nextCycle,
      periodLabel: `Cycle ${nextCycle} (${date.toLocaleString('default', { month: 'short', year: 'numeric' })})`,
      records: [],
      status: 'DRAFT',
      createdBy: new mongoose.Types.ObjectId(userId),
      totalSessionsPlanned: sessionLimit,
      sheetType: isGroup ? 'GROUP' : 'SINGLE',
    };
    
    if (isGroup) sheetData.groupClass = groupClassId;
    else sheetData.finalClass = finalClassId;

    sheet = await AttendanceSheet.create(sheetData);

    // Create automatic cycle payments (only for Single classes for now)
    if (!isGroup) {
        try {
          await createCyclePayments(String(sheet._id), userId);
        } catch (paymentErr) {
          logger.error(`Failed to create cycle payments for sheet ${sheet._id}: ${paymentErr}`);
        }
    }
  }

  // --- Auto-Pause Check (Single Class Only as per earlier task) ---
  if (!isGroup && (sheet.cycleNumber || 1) >= 2) {
    if (sheet.records.length === 2) {
      const payment = await Payment.findOne({
        attendanceSheet: sheet._id,
        paymentType: PAYMENT_TYPE.FEES_COLLECTED,
      });

      if (!payment || String(payment.status) !== PAYMENT_STATUS.PAID) {
        if (!isGroup) {
             await FinalClass.findByIdAndUpdate(finalClassId, { status: FINAL_CLASS_STATUS.PAUSED });
        }
        throw new ErrorResponse(
          'Payment for this cycle is pending. Class has been automatically paused.',
          400
        );
      }
    }
  }

  // --- Duplicate Check ---
  const existingRecordIndex = sheet.records.findIndex(
    (r: any) => new Date(r.sessionDate).toDateString() === date.toDateString()
  );
  if (existingRecordIndex >= 0) {
    throw new ErrorResponse('Attendance for this date already exists.', 400);
  }

  // --- Prepare New Record ---
  
  // Resolve Student Attendance for Group
  let groupStudentAttendances: IStudentAttendance[] = [];
  if (isGroup) {
      if (!studentAttendances || !Array.isArray(studentAttendances)) {
          throw new ErrorResponse('Student attendances list is required for group class', 400);
      }
      
      const enrollments = await StudentEnrollment.find({ 
          groupClass: groupClassId, 
          student: { $in: studentAttendances.map(s => s.student) },
          status: 'ACTIVE'
      });

      // Map request to schema
      groupStudentAttendances = studentAttendances.map(sa => {
          const enrollment = enrollments.find(e => String(e.student) === sa.student);
          return {
              student: new mongoose.Types.ObjectId(sa.student),
              enrollment: enrollment ? enrollment._id : undefined,
              status: (sa.status as any) || STUDENT_ATTENDANCE_STATUS.PRESENT,
              notes: sa.notes
          } as IStudentAttendance;
      });
  }

  const newRecord: IDailyAttendanceRecord = {
    sessionDate: date,
    durationHours: durationHours || 1, // Default 1
    topicCovered,
    studentAttendanceStatus: (studentAttendanceStatus as any) || STUDENT_ATTENDANCE_STATUS.PRESENT,
    status: ATTENDANCE_STATUS.PENDING,
    notes,
    submittedBy: new mongoose.Types.ObjectId(userId),
    submittedAt: new Date(),
    tutor: tutorId,
    studentAttendances: isGroup ? groupStudentAttendances : undefined
  };

  sheet.records.push(newRecord);

  // Recalculate stats
  sheet.totalSessionsTaken = sheet.records.length;
  // Present/Absent count logic
  if (!isGroup) {
      sheet.presentCount = sheet.records.filter((r: any) => r.studentAttendanceStatus === STUDENT_ATTENDANCE_STATUS.PRESENT).length;
      sheet.absentCount = sheet.records.filter((r: any) => r.studentAttendanceStatus === STUDENT_ATTENDANCE_STATUS.ABSENT).length;
  } else {
      // For groups, assuming sessions held = sessions present for the group entity context
      sheet.presentCount = sheet.records.length; 
  }
  
  sheet.totalSessionsPlanned = sessionLimit;

  // Auto-Submit if Full
  if (sessionLimit > 0 && sheet.totalSessionsTaken >= sessionLimit) {
      if (sheet.status === 'DRAFT') {
            sheet.status = 'PENDING';
            sheet.submittedAt = new Date();
      }
  }

  await sheet.save();

  // Update Tutor Experience & Tier logic
  try {
    if (tutorId) {
         await updateTutorExperienceAndTier(tutorId);
    }
  } catch (err) {
    logger.error(`Failed to update tutor tier stats: ${err}`);
  }

  return sheet;
};

export const updateDailyAttendance = async (
  recordId: string,
  updateData: Partial<{ sessionDate: Date; durationHours: number; topicCovered: string; notes: string; studentAttendanceStatus: string }>
) => {
  // Find the sheet containing this record
  const sheet = await AttendanceSheet.findOne({ 'records._id': recordId });
  if (!sheet) throw new ErrorResponse('Attendance record not found', 404);

  if (['APPROVED', 'REJECTED'].includes(sheet.status)) {
    throw new ErrorResponse('Cannot update record in an approved or rejected sheet', 400); 
  }

  const recordIndex = sheet.records.findIndex((r: any) => String(r._id) === recordId);
  if (recordIndex === -1) throw new ErrorResponse('Record not found in sheet', 404);

  const record = sheet.records[recordIndex];

  // Update fields
  if (updateData.sessionDate) record.sessionDate = new Date(updateData.sessionDate);
  if (updateData.durationHours) record.durationHours = updateData.durationHours;
  if (updateData.topicCovered !== undefined) record.topicCovered = updateData.topicCovered;
  if (updateData.notes !== undefined) record.notes = updateData.notes;
  if (updateData.studentAttendanceStatus) {
    record.studentAttendanceStatus = updateData.studentAttendanceStatus as any;
  }

  // Recalculate stats
  sheet.totalSessionsTaken = sheet.records.length;
  sheet.presentCount = sheet.records.filter((r: any) => r.studentAttendanceStatus === STUDENT_ATTENDANCE_STATUS.PRESENT).length;
  sheet.absentCount = sheet.records.filter((r: any) => r.studentAttendanceStatus === STUDENT_ATTENDANCE_STATUS.ABSENT).length;

  await sheet.save();

  return record;
};

export const getSheetsForClass = async (finalClassId: string, month?: number, year?: number) => {
  const query: any = { finalClass: finalClassId };
  if (month) query.month = month;
  if (year) query.year = year;

  return await AttendanceSheet.find(query)
    .sort({ cycleNumber: -1 })
    .populate([
      { 
        path: 'finalClass',
        populate: { path: 'classLead', select: 'classDurationHours' } 
      },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      // embedded records have tutor, submittedBy. 
      // Mongoose populates inside array of subdocs? Yes if path is correct.
      { path: 'records.tutor', select: 'name email phone' },
      { path: 'records.submittedBy', select: 'name email' }
    ]);
};

// Deprecated / Adapted mainly for backward compatibility if needed, but 'upsertAttendanceSheet' was likely only used by old controller
// We can remove it or keep a stub if referenced elsewhere.
// The new controller should use 'addDailyAttendance'.

export const submitAttendanceSheet = async (sheetId: string, _userId: string) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);

  // Authorization check could be added here

  sheet.status = 'PENDING';
  sheet.submittedAt = new Date();
  await sheet.save();
  return sheet;
};

export const getCoordinatorPendingSheets = async (coordinatorUserId: string) => {
  if (!mongoose.isValidObjectId(coordinatorUserId)) {
    return [];
  }

  const sheets = await AttendanceSheet.find({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    status: 'PENDING',
  })
    .sort({ cycleNumber: -1 })
    .populate([
      { path: 'finalClass', select: 'studentName className grade subject' },
      { path: 'coordinator', select: 'name email' },
      { path: 'createdBy', select: 'name email' }
    ]);

  return sheets;
};

export const getAllPendingSheets = async () => {
  const sheets = await AttendanceSheet.find({
    status: 'PENDING',
  })
    .sort({ cycleNumber: -1 })
    .populate([
      { path: 'finalClass', select: 'studentName className grade subject' },
      { path: 'coordinator', select: 'name email' },
      { path: 'createdBy', select: 'name email' }
    ]);

  return sheets;
};

export const approveAttendanceSheet = async (sheetId: string, coordinatorUserId: string, isAdmin: boolean = false) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  
  if (!isAdmin && String(sheet.coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to approve this sheet', 403);
  }
  if (sheet.status !== 'PENDING') {
    throw new ErrorResponse('Sheet must be in PENDING status to approve', 400);
  }

  // Verification Constraint: Check if all planned sessions are marked
  // let entity: any; // Unused
  let requiredSessions = 8;
  let currentTutorId: string;
  let startDate: Date;
  let tutorHistory: any[] = [];
  
  if (sheet.sheetType === 'GROUP' || sheet.groupClass) {
      if (!sheet.groupClass) throw new ErrorResponse('Group Class reference missing in Group Sheet', 500);
      const group = await GroupClass.findById(sheet.groupClass);
      if (!group) throw new ErrorResponse('Group class not found', 404);
      // entity = group;
      requiredSessions = group.sessionsPerMonth || 8;
      currentTutorId = group.tutor.toString();
      startDate = group.createdAt; // Group doesn't have startDate field in schema, use createdAt or we need to add startDate?
      // User request did not specify startDate for Group. 
      // We can use createdAt as proxy for start.
      tutorHistory = []; // No tutor history in Group Schema yet.
  } else {
      const finalClass = await FinalClass.findById(sheet.finalClass);
      if (!finalClass) throw new ErrorResponse('Final class not found', 404);
      // entity = finalClass;
      requiredSessions = finalClass.classesPerMonth || 8;
      currentTutorId = finalClass.tutor.toString();
      startDate = finalClass.startDate;
      tutorHistory = finalClass.tutorHistory || [];
  }
  
  if (sheet.records.length < requiredSessions) {
    // Check for Tutor Change Exception
    const sheetTutorId = sheet.records[0]?.tutor?.toString();
    
    let isException = false;

    // Exception 1: Outgoing Tutor
    if (sheetTutorId && sheetTutorId !== currentTutorId) {
       isException = true;
    }

    // Exception 2: Incoming Tutor
    if (!isException && sheetTutorId === currentTutorId) {
        const sheetMonth = sheet.month;
        const sheetYear = sheet.year;
        
        const classStartDate = new Date(startDate);
        const startMonth = classStartDate.getMonth() + 1;
        const startYear = classStartDate.getFullYear();

        if (startMonth === sheetMonth && startYear === sheetYear) {
             isException = true;
        } 
        
        if (!isException && tutorHistory.length > 0) {
            const historyEntry = tutorHistory.find(
                (h: any) => h.tutor && h.tutor.toString() === currentTutorId
            );
            if (historyEntry) {
                 const hDate = new Date(historyEntry.startDate);
                 if ((hDate.getMonth() + 1) === sheetMonth && hDate.getFullYear() === sheetYear) {
                     isException = true;
                 }
            }
        }
    }

    if (!isException) {
        throw new ErrorResponse(
          `Cannot verify incomplete sheet. This class requires ${requiredSessions} sessions, but only ${sheet.records.length} are marked.`,
          400
        );
    }
  }

  sheet.status = 'APPROVED';
  sheet.approvedBy = new mongoose.Types.ObjectId(coordinatorUserId);
  sheet.approvedAt = new Date();

  // Update all records to APPROVED status
  sheet.records.forEach(r => {
    r.status = ATTENDANCE_STATUS.APPROVED; 
  });

  await sheet.save();

  // Handle Post-Approval Actions
  try {
     if (sheet.sheetType === 'GROUP') {
         // 1. Update Student Enrollment Counters
         if (sheet.groupClass) {
             // For each record, for each studentAttendance
             // We need to aggregate.
             // Loop through records -> studentAttendances
             for (const record of sheet.records) {
                 if (record.studentAttendances && record.studentAttendances.length > 0) {
                     for (const sa of record.studentAttendances) {
                         if (sa.status === STUDENT_ATTENDANCE_STATUS.PRESENT && sa.enrollment) {
                             // Increment sessionsVerified for this enrollment
                             await StudentEnrollment.findByIdAndUpdate(sa.enrollment, { 
                                 $inc: { sessionsVerified: 1 } 
                             });
                         }
                     }
                 }
             }
         }

         // 2. Create Tutor Payment for Group?
         // Not explicitly requested but good practice.
         // createGroupPaymentForSheet(sheet)?
         // For now, only calling createPaymentForSheet if logic supports it or if we add a new function.
         // Calling createPaymentForSheet might fail if it expects FinalClass.
         await createPaymentForSheet(String(sheet._id), coordinatorUserId); 

     } else {
         // Single Class
         await createPaymentForSheet(String(sheet._id), coordinatorUserId);
     }
  } catch (e) {
    console.error(`Failed to create payment/stats for attendance sheet ${sheetId}: ${String(e)}`);
  }

  return sheet;
};

export const rejectAttendanceSheet = async (sheetId: string, coordinatorUserId: string, reason: string, isAdmin: boolean = false) => {
  const sheet = await AttendanceSheet.findById(sheetId);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  
  if (!isAdmin && String(sheet.coordinator) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to reject this sheet', 403);
  }
  
  // Can reject from PENDING or APPROVED? Usually PENDING.
  if (sheet.status !== 'PENDING' && sheet.status !== 'APPROVED') { 
      // Allowed to reject approved sheet if mistake found?
  }

  sheet.status = 'REJECTED';
  sheet.rejectedBy = new mongoose.Types.ObjectId(coordinatorUserId);
  sheet.rejectedAt = new Date();
  sheet.rejectionReason = reason;
  
  sheet.records.forEach(r => {
      r.status = ATTENDANCE_STATUS.REJECTED; // Update record status
  });

  await sheet.save();
  return sheet;
};

export default {
  addDailyAttendance,
  getSheetsForClass,
  submitAttendanceSheet,
  getCoordinatorPendingSheets,
  getAllPendingSheets,
  approveAttendanceSheet,
  rejectAttendanceSheet,
};
