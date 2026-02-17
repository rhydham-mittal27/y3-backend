import mongoose from 'mongoose';
import FinalClass, { ITutorHistory } from '../models/FinalClass';
import Attendance from '../models/Attendance';
import ClassLead from '../models/ClassLead';
import Tutor from '../models/Tutor';
import Coordinator from '../models/Coordinator';
import User from '../models/User';
import Notification from '../models/Notification';
import Student from '../models/Student';
import ErrorResponse from '../utils/errorResponse';
import { CLASS_LEAD_STATUS, FINAL_CLASS_STATUS, MANAGER_ACTION_TYPE, ATTENDANCE_STATUS, USER_ROLES } from '../config/constants';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import { createAdvancePaymentForFinalClass } from './paymentService';
import { generateStudentId } from '../utils/generateStudentId';
import { sendStudentCredentialsEmail } from './studentEmailService';
import bcrypt from 'bcryptjs';

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const computeMonthlyTotalSessions = (startDate: Date, schedule?: { daysOfWeek?: string[] }): number => {
  if (!schedule) return 0;
  const daysOfWeek: string[] = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  if (!daysOfWeek.length) return 0;

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  let total = 0;
  for (let current = new Date(start); current < end; current.setDate(current.getDate() + 1)) {
    current.setHours(0, 0, 0, 0);
    const weekdayIndex = (current.getDay() + 6) % 7; // convert Sun=0..Sat=6 to Mon=0..Sun=6
    const weekdayName = DAYS_ORDER[weekdayIndex];
    if (daysOfWeek.includes(weekdayName)) {
      total += 1;
    }
  }

  return total;
};

export const convertLeadToFinalClass = async (params: {
  classLeadId: string;
  coordinatorUserId?: string;
  parentUserId?: string;
  startDate: Date;
  schedule?: { daysOfWeek?: string[]; timeSlot?: string };
  totalSessions?: number;
  ratePerSession?: number;
  notes?: string;
  convertedBy: string;
  attendanceSubmissionWindow?: number;
  monthlyFees?: number;
  tutorMonthlyFees?: number;
}) => {
  const { classLeadId, coordinatorUserId, parentUserId, startDate, schedule, totalSessions, ratePerSession, notes, convertedBy, attendanceSubmissionWindow, monthlyFees, tutorMonthlyFees } = params;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const lead = await ClassLead.findById(classLeadId).populate('groupClass').session(session);
    if (!lead) throw new ErrorResponse('Class lead not found', 404);
    if (String(lead.status) !== CLASS_LEAD_STATUS.CONVERTED) {
      throw new ErrorResponse('Class lead must be in CONVERTED status', 400);
    }
    if (!lead.assignedTutor) {
      throw new ErrorResponse('Class lead must have assigned tutor', 400);
    }

    const existing = await FinalClass.findOne({ classLead: classLeadId }).session(session);
    if (existing) throw new ErrorResponse('Final class already exists for this lead', 409);

    // Coordinator is now optional - will be assigned later
    let coordinatorUserIdToUse = coordinatorUserId;
    let coordinator: any = null;
    
    if (coordinatorUserIdToUse) {
      coordinator = await Coordinator.findOne({ user: coordinatorUserIdToUse }).session(session);
      if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
      if (!coordinator.isActive) throw new ErrorResponse('Coordinator is not active', 400);
      const availableCapacity = (coordinator.maxClassCapacity || 0) - (coordinator.activeClassesCount || 0);
      if (availableCapacity <= 0) throw new ErrorResponse('Coordinator has reached maximum capacity', 400);
    }

    const tutorProfile = await Tutor.findOne({ user: lead.assignedTutor }).session(session);
    if (!tutorProfile) throw new ErrorResponse('Tutor profile not found', 404);

    let parentUserObjectId: mongoose.Types.ObjectId | undefined;
    if (parentUserId) {
      const parentUser = await User.findById(parentUserId).session(session);
      if (!parentUser) throw new ErrorResponse('Parent user not found', 404);
      // role check kept simple per plan; role enums are on user doc
      if (String(parentUser.role) !== 'PARENT') {
        throw new ErrorResponse('User must have PARENT role', 400);
      }
      parentUserObjectId = new mongoose.Types.ObjectId(parentUserId);
    }

    // Generate a unique class name CL-1234 (4 random digits)
    let className: string | null = null;
    for (let i = 0; i < 5; i++) {
      const suffix = Math.floor(1000 + Math.random() * 9000); // 1000-9999
      const candidate = `CL-${suffix}`;
      const exists = await FinalClass.findOne({ className: candidate }).session(session);
      if (!exists) {
        className = candidate;
        break;
      }
    }
    if (!className) {
      throw new ErrorResponse('Failed to generate unique class name', 500);
    }

    const autoTotalSessions =
      typeof totalSessions === 'number'
        ? totalSessions
        : computeMonthlyTotalSessions(new Date(startDate), schedule);

    // Generate student IDs and create student profiles
    let studentId: string | undefined;
    let studentGender: 'M' | 'F' | undefined;
    const createdStudents: any[] = [];
    // For group classes, track parent users created per email so we don't duplicate
    const parentUsersByEmail: Record<string, mongoose.Types.ObjectId> = {};
    
    if (lead.studentType === 'SINGLE' && lead.studentGender && lead.grade) {
      // Extract numeric grade from string (e.g., "Grade 10" -> 10)
      const gradeNumber = parseInt(lead.grade.replace(/\D/g, ''));
      if (!isNaN(gradeNumber) && gradeNumber > 0) {
        studentGender = lead.studentGender;
        studentId = generateStudentId({
          gender: studentGender,
          classGrade: gradeNumber,
        });

        // Create a Student profile with initial password = studentId
        if (studentId) {
          const plainPassword = studentId;
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(plainPassword, salt);

          const singleStudent = new Student({
            studentId,
            name: lead.studentName,
            gender: studentGender,
            grade: lead.grade,
            finalClass: new mongoose.Types.ObjectId(),
            classLead: new mongoose.Types.ObjectId(classLeadId),
            password: hashedPassword,
            isPasswordChanged: false,
          });

          createdStudents.push(singleStudent);

          if (lead.parentEmail) {
            try {
              await sendStudentCredentialsEmail({
                parentEmail: lead.parentEmail,
                studentName: lead.studentName,
                className: className || `Class ${lead.grade}`,
                studentId,
                password: plainPassword,
              });
            } catch (emailError) {
              console.error('Failed to send student credentials email for single student:', emailError);
            }
          }
        }

        // Auto-create/link parent user for single-student leads
        if (!parentUserObjectId && lead.parentEmail && studentId) {
          const normalizedEmail = String(lead.parentEmail).toLowerCase().trim();
          let parentUser = await User.findOne({ email: normalizedEmail }).session(session);
          if (!parentUser) {
            parentUser = new User({
              name: (lead as any).parentName || `Parent of ${lead.studentName}`,
              email: normalizedEmail,
              role: USER_ROLES.PARENT,
              password: studentId,
            } as any);
            await parentUser.save({ session });
          }
          parentUserObjectId = parentUser._id;
        }
      }
    } else if (lead.studentType === 'GROUP' && (lead.groupClass || lead.studentDetails) && lead.grade) {
      // Create individual student profiles for group classes
      const studentDetailsToUse = (lead.groupClass as any)?.students || lead.studentDetails;
      const gradeNumber = parseInt(lead.grade.replace(/\D/g, ''));
      if (!isNaN(gradeNumber) && gradeNumber > 0 && studentDetailsToUse) {
        for (const studentDetail of studentDetailsToUse) {
          // Validate student detail has required gender
          if (!studentDetail.gender || !['M', 'F'].includes(studentDetail.gender)) {
            throw new Error(`Student ${studentDetail.name || 'Unknown'} has invalid or missing gender. Gender is required for student ID generation.`);
          }
          
          const studentIdForGroup = generateStudentId({
            gender: studentDetail.gender,
            classGrade: gradeNumber,
          });
          
          // Initial password for students = their studentId
          const plainPassword = studentIdForGroup;
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(plainPassword, salt);
          
          const newStudent = new Student({
            studentId: studentIdForGroup,
            name: studentDetail.name,
            gender: studentDetail.gender,
            grade: lead.grade,
            finalClass: new mongoose.Types.ObjectId(), // Will be set after FinalClass creation
            classLead: new mongoose.Types.ObjectId(classLeadId),
            password: hashedPassword,
            isPasswordChanged: false,
          });
          
          // TODO: Send password to parent/student via email/SMS
          console.log(`Student ID: ${studentIdForGroup}, Password: ${plainPassword}`);

          // Send credentials email to individual parent if available, otherwise fall back to lead.parentEmail
          const targetParentEmail = studentDetail.parentEmail || lead.parentEmail;
          if (targetParentEmail) {
            // Ensure a PARENT user exists for this email, using this student's ID as initial password
            const normalizedEmail = String(targetParentEmail).toLowerCase().trim();
            let parentUserIdForEmail = parentUsersByEmail[normalizedEmail];
            if (!parentUserIdForEmail) {
              let parentUser = await User.findOne({ email: normalizedEmail }).session(session);
              if (!parentUser) {
                parentUser = new User({
                  name: (studentDetail as any).parentName || `Parent of ${studentDetail.name}`,
                  email: normalizedEmail,
                  role: USER_ROLES.PARENT,
                  password: studentIdForGroup,
                } as any);
                await parentUser.save({ session });
              }
              parentUserIdForEmail = parentUser._id;
              parentUsersByEmail[normalizedEmail] = parentUserIdForEmail;
            }

            // Send credentials email to individual parent if available, otherwise fall back to lead.parentEmail
            try {
              await sendStudentCredentialsEmail({
                parentEmail: targetParentEmail,
                studentName: studentDetail.name,
                className: className || `Class ${lead.grade}`,
                studentId: studentIdForGroup,
                password: plainPassword,
              });
            } catch (emailError) {
              console.error('Failed to send student credentials email:', emailError);
              // Continue with student creation even if email fails
            }
          }
          
          createdStudents.push(newStudent);
        }
      }
    }

    // If no explicit parentUserId was provided but we have created parent users for a group,
    // attach the first one as the primary parent on the FinalClass.
    if (!parentUserObjectId && Object.keys(parentUsersByEmail).length > 0) {
      const firstEmail = Object.keys(parentUsersByEmail)[0];
      parentUserObjectId = parentUsersByEmail[firstEmail];
    }

    const denom = lead.classesPerMonth || autoTotalSessions || 8;
    const calculatedParentRate = typeof ratePerSession === 'number' && ratePerSession > 0 
      ? ratePerSession 
      : (lead.paymentAmount || 0) / denom;
    const calculatedTutorRate = (lead.tutorFees || 0) / denom;

    const created = new FinalClass({
      className,
      classLead: new mongoose.Types.ObjectId(classLeadId),
      tutor: lead.assignedTutor as any,
      coordinator: coordinatorUserIdToUse ? new mongoose.Types.ObjectId(coordinatorUserIdToUse) : undefined,
      parent: parentUserObjectId,
      startDate: new Date(startDate),
      schedule,
      totalSessions: autoTotalSessions,
      ratePerSession: calculatedParentRate,
      tutorRatePerSession: calculatedTutorRate,
      completedSessions: 0,
      studentName: lead.studentType === 'SINGLE' ? lead.studentName : `Group Class (${((lead.groupClass as any)?.students || lead.studentDetails)?.length || 0} students)`,
      studentGender,
      studentId,
      subject: lead.subject,
      grade: lead.grade,
      board: String(lead.board),
      mode: String(lead.mode),
      location: lead.location,
      convertedBy: new mongoose.Types.ObjectId(convertedBy),
      status: FINAL_CLASS_STATUS.ACTIVE,
      notes,
      classesPerMonth: lead.classesPerMonth,
      testPerMonth: 1,
      attendanceSubmissionWindow: typeof attendanceSubmissionWindow === 'number' ? attendanceSubmissionWindow : 2,
      monthlyFees: typeof monthlyFees === 'number' ? monthlyFees : (lead.paymentAmount || 0),
      tutorMonthlyFees: typeof tutorMonthlyFees === 'number' ? tutorMonthlyFees : (lead.tutorFees || 0),
    });

    await created.save({ session });

    // Save student profiles for group classes
    if (createdStudents.length > 0) {
      // Update finalClass reference for each student
      for (const student of createdStudents) {
        student.finalClass = created._id;
      }
      
      // Save all student profiles
      await Student.insertMany(createdStudents, { session });
    }

    // Attempt to create an advance payment for this class using the lead's paymentAmount as fixed advance fee
    let advancePaymentCreated = false;
    try {
      const payment = await createAdvancePaymentForFinalClass(String(created._id), convertedBy);
      if (payment) {
        advancePaymentCreated = true;
      }
    } catch (e) {
      // Do not block class creation if advance payment fails; this can be handled manually
    }

    // Update coordinator stats if coordinator is assigned
    if (coordinator) {
      await Coordinator.findByIdAndUpdate(
        coordinator._id,
        {
          $inc: { activeClassesCount: 1, totalClassesHandled: 1 },
          $push: { assignedClasses: created._id },
        },
        { session }
      );
    }

    await Tutor.findByIdAndUpdate(
      tutorProfile._id,
      { $inc: { classesAssigned: 1 } },
      { session }
    );

    // Notifications
    const notifications: any[] = [
      {
        recipient: lead.assignedTutor,
        type: 'GENERAL',
        title: 'New Class Assigned',
        message: `You have been assigned a new class for student ${lead.studentName}.`,
        relatedClassLead: lead._id,
      },
    ];
    
    // Add coordinator notification only if coordinator is assigned
    if (coordinator) {
      notifications.push({
        recipient: coordinator.user,
        type: 'GENERAL',
        title: 'Class Conversion Completed',
        message: `A converted class has been assigned under your coordination for ${lead.studentName}.`,
        relatedClassLead: lead._id,
      });
    }
    
    await Notification.insertMany(notifications, { session, ordered: true });

    await session.commitTransaction();

    await created.populate([
      { path: 'classLead' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'convertedBy', select: 'name email role' },
    ]);
    try {
      await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(convertedBy) }, { $inc: { classesConverted: 1 } });
      const studentName = (created as any).studentName;
      await logManagerActivity(
        convertedBy,
        MANAGER_ACTION_TYPE.CONVERT_TO_FINAL_CLASS,
        `Converted class lead to final class for student ${studentName}`,
        { entityType: 'FinalClass', entityId: String(created._id), entityName: studentName },
        { classLeadId, tutorId: String(lead.assignedTutor), coordinatorId: coordinatorUserIdToUse, startDate }
      );
    } catch {}

    const createdObj = created.toObject();
    return { ...createdObj, advancePaymentCreated };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const getAllFinalClasses = async (args: {
  page: number;
  limit: number;
  status?: FINAL_CLASS_STATUS | string;
  coordinatorId?: string;
  tutorId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  noCoordinator?: boolean;
  search?: string;
  convertedBy?: string;
}) => {
  const { page, limit, status, coordinatorId, tutorId, sortBy, sortOrder, noCoordinator, search, convertedBy } = args;
  const query: any = {};
  if (status) query.status = status;
  if (coordinatorId) query.coordinator = new mongoose.Types.ObjectId(coordinatorId);
  if (tutorId) query.tutor = new mongoose.Types.ObjectId(tutorId);
  if (convertedBy) query.convertedBy = new mongoose.Types.ObjectId(convertedBy);
  if (noCoordinator) {
    query.$or = [
      { coordinator: { $exists: false } },
      { coordinator: null },
    ];
  }

  if (search) {
    query.$or = [
      ...(query.$or || []),
      { studentName: { $regex: search, $options: 'i' } },
      { className: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { grade: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [classes, total] = await Promise.all([
    FinalClass.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'classLead' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'coordinator', select: 'name email phone' },
        { path: 'parent', select: 'name email phone' },
        { path: 'convertedBy', select: 'name email role' },
      ]),
    FinalClass.countDocuments(query),
  ]);

  return { classes, total, page, limit };
};

export const getFinalClassById = async (classId: string) => {
  const cls = await FinalClass.findById(classId).populate([
    { path: 'classLead' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'convertedBy', select: 'name email role' },
  ]);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  return cls;
};

export const updateFinalClass = async (
  classId: string,
  updateData: Partial<{
    schedule: { daysOfWeek?: string[]; timeSlot?: string };
    totalSessions: number;
    endDate?: Date;
    notes?: string;
    coordinatorUserId?: string;
    attendanceSubmissionWindow?: number;
    monthlyFees?: number;
    tutorMonthlyFees?: number;
  }>
) => {
  const cls = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (cls.status !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Cannot update completed/cancelled class', 400);
  }
  if (updateData.coordinatorUserId) {
    const coordinator = await Coordinator.findOne({ user: updateData.coordinatorUserId });
    if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
    if (!coordinator.isActive) throw new ErrorResponse('Coordinator is not active', 400);
    const availableCapacity = (coordinator.maxClassCapacity || 0) - (coordinator.activeClassesCount || 0);
    if (availableCapacity <= 0) throw new ErrorResponse('Coordinator has reached maximum capacity', 400);

    const oldCoordinatorUserId = cls.coordinator;
    if (String(oldCoordinatorUserId) !== String(updateData.coordinatorUserId)) {
      // Decrement old coordinator if exists
      if (oldCoordinatorUserId) {
        await Coordinator.findOneAndUpdate(
          { user: oldCoordinatorUserId },
          { 
            $inc: { activeClassesCount: -1 },
            $pull: { assignedClasses: cls._id }
          }
        );
      }

      // Increment new coordinator
      await Coordinator.findOneAndUpdate(
         { user: updateData.coordinatorUserId },
         { 
           $inc: { activeClassesCount: 1, totalClassesHandled: 1 },
           $push: { assignedClasses: cls._id }
         }
      );

      (cls as any).coordinator = new mongoose.Types.ObjectId(updateData.coordinatorUserId);
    }
  }
  if (updateData.schedule && !('totalSessions' in updateData)) {
    const mergedSchedule: { daysOfWeek?: string[]; timeSlot?: string } = {
      ...((cls as any).schedule || {}),
      ...updateData.schedule,
    };
    cls.totalSessions = computeMonthlyTotalSessions(cls.startDate, mergedSchedule);
    (cls as any).schedule = mergedSchedule;
  } else {
    // Exclude coordinatorUserId helper field from direct assignment
    const { coordinatorUserId, ...rest } = updateData as any;
    Object.assign(cls, rest);
  }
  await cls.save();
  await cls.populate([
    { path: 'classLead' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'convertedBy', select: 'name email role' },
  ]);
  return cls;
};

export const updateFinalClassStatus = async (
  classId: string,
  newStatus: FINAL_CLASS_STATUS | string,
  actualEndDate?: Date
) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const cls = await FinalClass.findById(classId).session(session);
    if (!cls) throw new ErrorResponse('Final class not found', 404);

    const current = cls.status as FINAL_CLASS_STATUS;
    if (current === newStatus) {
      await session.commitTransaction();
      session.endSession();
      return cls;
    }
    
    // Status transition validation removed as per request
    // Any status transition is now allowed

    cls.status = newStatus as any;
    if (newStatus === FINAL_CLASS_STATUS.COMPLETED || newStatus === FINAL_CLASS_STATUS.CANCELLED) {
      cls.actualEndDate = actualEndDate ? new Date(actualEndDate) : new Date();
      // Decrement coordinator's active classes
      await Coordinator.updateOne({ user: cls.coordinator }, { $inc: { activeClassesCount: -1 } }).session(session);
      if (newStatus === FINAL_CLASS_STATUS.COMPLETED) {
        // Increment tutor's completed classes
        await Tutor.updateOne({ user: cls.tutor }, { $inc: { classesCompleted: 1 } }).session(session);
      }
    }

    await cls.save({ session });
    await session.commitTransaction();

    await cls.populate([
      { path: 'classLead' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'convertedBy', select: 'name email role' },
    ]);

    return cls;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateSessionProgress = async (classId: string, completedSessions: number) => {
  const cls = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (cls.totalSessions && completedSessions > cls.totalSessions) {
    throw new ErrorResponse('Completed sessions cannot exceed total sessions', 400);
  }
  cls.completedSessions = completedSessions;
  await cls.save();
  await cls.populate([
    { path: 'classLead' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'convertedBy', select: 'name email role' },
  ]);
  return cls;
};

export const getClassesByCoordinator = async (coordinatorUserId: string, status?: FINAL_CLASS_STATUS | string) => {
  const coord = await Coordinator.findOne({ user: coordinatorUserId });
  if (!coord) throw new ErrorResponse('Coordinator not found', 404);
  const query: any = { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) };
  if (status) query.status = status;
  const classes = await FinalClass.find(query).populate([
    { path: 'classLead' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'convertedBy', select: 'name email role' },
  ]);
  return classes;
};

export const computeTutorMonthlyStats = async (tutorUserId: string) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  const classes = await getClassesByTutor(tutorUserId, FINAL_CLASS_STATUS.ACTIVE);

  const classesThisMonth = classes.filter((cls: any) => {
    if (!cls.startDate) return false;
    const start = new Date(cls.startDate);
    return start.getFullYear() === year && start.getMonth() === month;
  });

  // Compute total sessions from today until end of this month from timetable (schedule)
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  let totalSessions = 0;

  // Start from "today" (login day), but never before the 1st of this month
  const startFrom = new Date(now);
  startFrom.setHours(0, 0, 0, 0);
  if (startFrom < firstDayOfMonth) {
    startFrom.setTime(firstDayOfMonth.getTime());
  }

  for (let current = new Date(startFrom); current <= lastDayOfMonth; current.setDate(current.getDate() + 1)) {
    current.setHours(0, 0, 0, 0);

    classesThisMonth.forEach((cls: any) => {
      const sched = cls.schedule || {};
      const daysOfWeek: string[] = Array.isArray(sched.daysOfWeek) ? sched.daysOfWeek : [];
      if (!daysOfWeek.length) return;

      const classStart = cls.startDate ? new Date(cls.startDate) : firstDayOfMonth;
      classStart.setHours(0, 0, 0, 0);
      if (current < classStart) return;
      if (cls.endDate) {
        const classEnd = new Date(cls.endDate as Date);
        classEnd.setHours(0, 0, 0, 0);
        if (current > classEnd) return;
      }

      const weekdayIndex = (current.getDay() + 6) % 7; // convert Sun=0..Sat=6 to Mon=0..Sun=6
      const weekdayName = DAYS_ORDER[weekdayIndex];
      if (daysOfWeek.includes(weekdayName)) {
        totalSessions += 1;
      }
    });
  }

  // Completed sessions this month based on approved attendance (from month start up to now)
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthNowEnd = new Date(now);
  monthNowEnd.setHours(23, 59, 59, 999);

  const completedSessions = await Attendance.countDocuments({
    tutor: new mongoose.Types.ObjectId(tutorUserId),
    sessionDate: { $gte: monthStart, $lte: monthNowEnd },
    status: { $in: [ATTENDANCE_STATUS.COORDINATOR_APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED] },
  });

  return {
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    totalClasses: classesThisMonth.length,
    totalSessions,
    completedSessions,
  };
};

export const getClassesByTutor = async (tutorUserId: string, status?: FINAL_CLASS_STATUS | string) => {
  if (!mongoose.isValidObjectId(tutorUserId)) {
    return [];
  }
  const query: any = { tutor: new mongoose.Types.ObjectId(tutorUserId) };
  if (status) query.status = status;
  const classes = await FinalClass.find(query).populate([
    { path: 'classLead' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'parent', select: 'name email phone' },
    { path: 'convertedBy', select: 'name email role' },
  ]);
  return classes;
};

export const getClassesByParent = async (parentUserId: string, status?: FINAL_CLASS_STATUS | string) => {
  if (!mongoose.isValidObjectId(parentUserId)) {
    return [];
  }
  const query: any = { parent: new mongoose.Types.ObjectId(parentUserId) };
  if (status) query.status = status;
  const classes = await FinalClass.find(query)
    .sort({ startDate: -1 })
    .populate([
      { path: 'classLead' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'convertedBy', select: 'name email role' },
    ]);
  return classes;
};

export const getStudentsByFinalClass = async (finalClassId: string) => {
  if (!mongoose.isValidObjectId(finalClassId)) {
    return [];
  }
  const students = await Student.find({ finalClass: new mongoose.Types.ObjectId(finalClassId) })
    .sort({ name: 1 });
  return students;
};

export const changeTutor = async (params: {
  classId: string;
  newTutorUserId: string;
  reason?: string;
  changedBy: string;
}) => {
  const { classId, newTutorUserId, reason, changedBy } = params;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const cls = await FinalClass.findById(classId).session(session);
    if (!cls) throw new ErrorResponse('Final class not found', 404);
    if (cls.status !== FINAL_CLASS_STATUS.ACTIVE) {
      throw new ErrorResponse('Cannot change tutor for inactive class', 400);
    }

    const oldTutorUserId = cls.tutor;
    if (String(oldTutorUserId) === String(newTutorUserId)) {
      throw new ErrorResponse('New tutor must be different from the current tutor', 400);
    }

    const newTutorProfile = await Tutor.findOne({ user: newTutorUserId }).session(session);
    if (!newTutorProfile) throw new ErrorResponse('New tutor profile not found', 404);

    // Update history for old tutor
    const historyEntry: ITutorHistory = {
      tutor: oldTutorUserId,
      startDate: cls.updatedAt || cls.createdAt, // Approximating start date as last update or creation
      endDate: new Date(),
      reason: reason || 'Tutor changed by manager',
      replacedBy: new mongoose.Types.ObjectId(newTutorUserId),
    };

    if (!cls.tutorHistory) cls.tutorHistory = [];
    cls.tutorHistory.push(historyEntry);

    // Update class with new tutor
    cls.tutor = new mongoose.Types.ObjectId(newTutorUserId) as any;
    
    await cls.save({ session });

    // Update tutor stats
    await Tutor.updateOne({ user: oldTutorUserId }, { $inc: { classesAssigned: -1 } }).session(session);
    await Tutor.updateOne({ user: newTutorUserId }, { $inc: { classesAssigned: 1 } }).session(session);

    // Log activity
    await logManagerActivity(
      changedBy,
      MANAGER_ACTION_TYPE.CHANGE_TUTOR,
      `Changed tutor for class ${cls.className} from ${oldTutorUserId} to ${newTutorUserId}`,
      { entityType: 'FinalClass', entityId: String(cls._id), entityName: cls.studentName },
      { oldTutorUserId, newTutorUserId, reason }
    );

    // Notify new tutor
    await Notification.create([{
      recipient: newTutorUserId,
      type: 'GENERAL',
      title: 'New Class Assigned (Tutor Change)',
      message: `You have been assigned to class ${cls.className} for student ${cls.studentName}.`,
      relatedFinalClass: cls._id,
    }], { session });

    await session.commitTransaction();

    await cls.populate([
      { path: 'classLead' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'parent', select: 'name email phone' },
      { path: 'tutorHistory.tutor', select: 'name email phone' },
      { path: 'tutorHistory.replacedBy', select: 'name email phone' },
    ]);

    return cls;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const handleTutorLeaving = async (params: {
  classId: string;
  reason?: string;
  changedBy: string;
}) => {
  const { classId, reason, changedBy } = params;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const cls = await FinalClass.findById(classId).session(session);
    if (!cls) throw new ErrorResponse('Final class not found', 404);
    
    const oldTutorUserId = cls.tutor;
    
    // Update history for old tutor
    const historyEntry: ITutorHistory = {
      tutor: oldTutorUserId,
      startDate: cls.updatedAt || cls.createdAt,
      endDate: new Date(),
      reason: reason || 'Tutor left mid-session',
    };

    if (!cls.tutorHistory) cls.tutorHistory = [];
    cls.tutorHistory.push(historyEntry);

    // We don't nullify the tutor yet, but we might want to mark the class as needing a tutor
    // For now, let's keep the old tutor until the new one is assigned, 
    // or we could nullify if the schema allows (it currently says required: true)
    // Since it's required, we can't nullify. We'll rely on the status or a flag if we had one.
    // However, the user said "if teacher leaves then manager should be able to repost it"
    
    await cls.save({ session });

    await Tutor.updateOne({ user: oldTutorUserId }, { $inc: { classesAssigned: -1 } }).session(session);

    // Log activity
    await logManagerActivity(
      changedBy,
      MANAGER_ACTION_TYPE.TUTOR_LEFT_MID_SESSION,
      `Tutor ${oldTutorUserId} left class ${cls.className}`,
      { entityType: 'FinalClass', entityId: String(cls._id), entityName: cls.studentName },
      { oldTutorUserId, reason }
    );

    await session.commitTransaction();

    await cls.populate([
      { path: 'classLead' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'tutorHistory.tutor', select: 'name email phone' },
    ]);

    return cls;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export default {
  convertLeadToFinalClass,
  getAllFinalClasses,
  getFinalClassById,
  updateFinalClass,
  updateFinalClassStatus,
  updateSessionProgress,
  getClassesByCoordinator,
  getClassesByTutor,
  getClassesByParent,
  computeTutorMonthlyStats,
  getStudentsByFinalClass,
  changeTutor,
  handleTutorLeaving,
};
