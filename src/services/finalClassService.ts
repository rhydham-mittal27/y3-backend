import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import ClassLead from '../models/ClassLead';
import Tutor from '../models/Tutor';
import Coordinator from '../models/Coordinator';
import User from '../models/User';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { CLASS_LEAD_STATUS, FINAL_CLASS_STATUS, MANAGER_ACTION_TYPE } from '../config/constants';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';

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
}) => {
  const { classLeadId, coordinatorUserId, parentUserId, startDate, schedule, totalSessions, ratePerSession, notes, convertedBy } = params;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const lead = await ClassLead.findById(classLeadId).session(session);
    if (!lead) throw new ErrorResponse('Class lead not found', 404);
    if (String(lead.status) !== CLASS_LEAD_STATUS.CONVERTED) {
      throw new ErrorResponse('Class lead must be in CONVERTED status', 400);
    }
    if (!lead.assignedTutor) {
      throw new ErrorResponse('Class lead must have assigned tutor', 400);
    }

    const existing = await FinalClass.findOne({ classLead: classLeadId }).session(session);
    if (existing) throw new ErrorResponse('Final class already exists for this lead', 409);

    let coordinatorUserIdToUse = coordinatorUserId;
    if (!coordinatorUserIdToUse) {
      const anyCoordinator = await Coordinator.findOne({ isActive: true }).session(session);
      if (!anyCoordinator) throw new ErrorResponse('Coordinator not found', 404);
      coordinatorUserIdToUse = String(anyCoordinator.user);
    }

    const coordinator = await Coordinator.findOne({ user: coordinatorUserIdToUse }).session(session);
    if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
    if (!coordinator.isActive) throw new ErrorResponse('Coordinator is not active', 400);
    const availableCapacity = (coordinator.maxClassCapacity || 0) - (coordinator.activeClassesCount || 0);
    if (availableCapacity <= 0) throw new ErrorResponse('Coordinator has reached maximum capacity', 400);

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

    const created = new FinalClass({
      className,
      classLead: new mongoose.Types.ObjectId(classLeadId),
      tutor: lead.assignedTutor as any,
      coordinator: new mongoose.Types.ObjectId(coordinatorUserIdToUse),
      parent: parentUserObjectId,
      startDate: new Date(startDate),
      schedule,
      totalSessions: totalSessions ?? 0,
      ratePerSession: typeof ratePerSession === 'number' ? ratePerSession : 0,
      completedSessions: 0,
      studentName: lead.studentName,
      subject: lead.subject,
      grade: lead.grade,
      board: String(lead.board),
      mode: String(lead.mode),
      location: lead.location,
      convertedBy: new mongoose.Types.ObjectId(convertedBy),
      status: FINAL_CLASS_STATUS.ACTIVE,
      notes,
    });

    await created.save({ session });

    await Coordinator.findByIdAndUpdate(
      coordinator._id,
      {
        $inc: { activeClassesCount: 1, totalClassesHandled: 1 },
        $push: { assignedClasses: created._id },
      },
      { session }
    );

    await Tutor.findByIdAndUpdate(
      tutorProfile._id,
      { $inc: { classesAssigned: 1 } },
      { session }
    );

    // Notifications
    await Notification.insertMany(
      [
        {
          recipient: lead.assignedTutor,
          type: 'GENERAL',
          title: 'New Class Assigned',
          message: `You have been assigned a new class for student ${lead.studentName}.`,
          relatedClassLead: lead._id,
        },
        {
          recipient: coordinator.user,
          type: 'GENERAL',
          title: 'Class Conversion Completed',
          message: `A converted class has been assigned under your coordination for ${lead.studentName}.`,
          relatedClassLead: lead._id,
        },
      ],
      { session, ordered: true }
    );

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
    return created;
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
}) => {
  const { page, limit, status, coordinatorId, tutorId, sortBy, sortOrder } = args;
  const query: any = {};
  if (status) query.status = status;
  if (coordinatorId) query.coordinator = new mongoose.Types.ObjectId(coordinatorId);
  if (tutorId) query.tutor = new mongoose.Types.ObjectId(tutorId);

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
  updateData: Partial<{ schedule: { daysOfWeek?: string[]; timeSlot?: string }; totalSessions: number; endDate?: Date; notes?: string }>
) => {
  const cls = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (cls.status !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Cannot update completed/cancelled class', 400);
  }
  Object.assign(cls, updateData);
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
    const allowed: Record<FINAL_CLASS_STATUS, (FINAL_CLASS_STATUS | string)[]> = {
      [FINAL_CLASS_STATUS.ACTIVE]: [FINAL_CLASS_STATUS.COMPLETED, FINAL_CLASS_STATUS.PAUSED, FINAL_CLASS_STATUS.CANCELLED],
      [FINAL_CLASS_STATUS.PAUSED]: [FINAL_CLASS_STATUS.ACTIVE, FINAL_CLASS_STATUS.CANCELLED],
      [FINAL_CLASS_STATUS.COMPLETED]: [],
      [FINAL_CLASS_STATUS.CANCELLED]: [],
    };

    if (current === newStatus) {
      await session.commitTransaction();
      session.endSession();
      return cls;
    }

    if (!allowed[current]?.includes(newStatus)) {
      throw new ErrorResponse('Invalid status transition', 400);
    }

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

export default {
  convertLeadToFinalClass,
  getAllFinalClasses,
  getFinalClassById,
  updateFinalClass,
  updateFinalClassStatus,
  updateSessionProgress,
  getClassesByCoordinator,
  getClassesByTutor,
};
