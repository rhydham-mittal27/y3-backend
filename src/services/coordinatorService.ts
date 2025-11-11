import mongoose from 'mongoose';
import Coordinator from '../models/Coordinator';
import User from '../models/User';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { USER_ROLES, MANAGER_ACTION_TYPE, FINAL_CLASS_STATUS, PAYMENT_STATUS, ATTENDANCE_STATUS } from '../config/constants';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import { getPendingApprovalsForCoordinator } from './attendanceService';

export const createCoordinator = async (
  userId: string,
  specialization?: string[],
  maxClassCapacity?: number,
  managerUserId?: string
) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);
  if (String(user.role) !== USER_ROLES.COORDINATOR) {
    throw new ErrorResponse('User is not a COORDINATOR', 400);
  }

  const existing = await Coordinator.findOne({ user: userId });
  if (existing) throw new ErrorResponse('Coordinator profile already exists', 409);

  const coordinator = await Coordinator.create({
    user: new mongoose.Types.ObjectId(userId),
    specialization,
    maxClassCapacity: maxClassCapacity ?? 10,
  });

  await coordinator.populate({ path: 'user', select: 'name email phone role' });

  if (managerUserId) {
    try {
      await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(managerUserId) }, { $inc: { coordinatorsCreated: 1 } });
      await logManagerActivity(
        managerUserId,
        MANAGER_ACTION_TYPE.CREATE_COORDINATOR,
        `Created coordinator profile for ${(coordinator as any).user?.name || ''}`,
        { entityType: 'Coordinator', entityId: String(coordinator._id), entityName: (coordinator as any).user?.name },
        { specialization, maxClassCapacity: coordinator.maxClassCapacity }
      );
    } catch {}
  }
  return coordinator;
};

export const getCoordinatorPaymentSummary = async (
  coordinatorUserId: string,
  filters?: { status?: string; classId?: string; fromDate?: Date; toDate?: Date; page: number; limit: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
) => {
  const classes = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId) }).select('_id');
  const classIds = classes.map((c) => c._id);

  const query: any = { finalClass: { $in: classIds } };
  if (filters?.status) query.status = filters.status;
  if (filters?.classId) query.finalClass = new mongoose.Types.ObjectId(filters.classId);
  if (filters?.fromDate || filters?.toDate) {
    query.createdAt = {} as any;
    if (filters.fromDate) (query.createdAt as any).$gte = filters.fromDate;
    if (filters.toDate) (query.createdAt as any).$lte = filters.toDate;
  }

  const page = filters?.page || 1;
  const limit = filters?.limit || 10;
  const skip = (page - 1) * limit;
  const sortField = filters?.sortBy || 'dueDate';
  const sortDir = filters?.sortOrder === 'desc' ? -1 : 1;
  const sort: any = { [sortField]: sortDir };

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'finalClass' },
        { path: 'attendance' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'createdBy', select: 'name email' },
        { path: 'paidBy', select: 'name email' },
      ]),
    Payment.countDocuments(query),
  ]);

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const overduePayments = payments.filter((p: any) => [PAYMENT_STATUS.PENDING, 'OVERDUE'].includes(p.status) && p.dueDate && p.dueDate < now);
  const upcomingPayments = payments.filter((p: any) => p.status === PAYMENT_STATUS.PENDING && p.dueDate && p.dueDate >= now && p.dueDate <= in7Days);
  const paidPayments = payments.filter((p: any) => p.status === PAYMENT_STATUS.PAID);

  const amounts = payments.reduce(
    (acc: any, p: any) => {
      acc.totalAmount += Number(p.amount) || 0;
      if (p.status === PAYMENT_STATUS.PAID) acc.paidAmount += Number(p.amount) || 0;
      if (p.status === PAYMENT_STATUS.PENDING) acc.pendingAmount += Number(p.amount) || 0;
      if ((p.status as any) === 'OVERDUE') acc.overdueAmount += Number(p.amount) || 0;
      return acc;
    },
    { totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0 }
  );

  const result = {
    payments,
    total,
    page,
    limit,
    statistics: {
      totalAmount: amounts.totalAmount,
      paidAmount: amounts.paidAmount,
      pendingAmount: amounts.pendingAmount,
      overdueAmount: amounts.overdueAmount,
      overdueCount: overduePayments.length,
      upcomingCount: upcomingPayments.length,
      paidCount: paidPayments.length,
    },
    categorized: {
      overdue: overduePayments,
      upcoming: upcomingPayments,
      paid: paidPayments,
    },
  };

  return result;
};

export const getCoordinatorDashboardStats = async (coordinatorUserId: string) => {
  const coordinator = await Coordinator.findOne({ user: coordinatorUserId });
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  const activeClasses = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId), status: FINAL_CLASS_STATUS.ACTIVE });

  const pendingApprovals = await getPendingApprovalsForCoordinator(coordinatorUserId);
  const pendingAttendanceApprovals = Array.isArray(pendingApprovals)
    ? pendingApprovals.length
    : (((pendingApprovals as any)?.total) || 0);

  const now = new Date();
  const overduePaymentsAgg = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.PENDING, dueDate: { $lt: now } } },
    { $lookup: { from: 'finalclasses', localField: 'finalClass', foreignField: '_id', as: 'fc' } },
    { $unwind: '$fc' },
    { $match: { 'fc.coordinator': new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $count: 'count' },
  ]);
  const overduePaymentsCount = overduePaymentsAgg[0]?.count || 0;

  const todaysTasksCount = pendingAttendanceApprovals + overduePaymentsCount;

  return {
    totalClassesAssigned: Array.isArray((coordinator as any).assignedClasses) ? (coordinator as any).assignedClasses.length : 0,
    activeClassesCount: coordinator.activeClassesCount || activeClasses.length,
    totalClassesHandled: coordinator.totalClassesHandled || 0,
    pendingAttendanceApprovals,
    todaysTasksCount,
    performanceScore: coordinator.performanceScore || 0,
  };
};

export const getCoordinatorProfileMetrics = async (
  coordinatorUserId: string,
  fromDate?: Date,
  toDate?: Date
) => {
  const coordinator = await Coordinator.findOne({ user: coordinatorUserId });
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  const dateFilterCreatedAt: any = {};
  const hasDateFilter = !!fromDate || !!toDate;
  if (fromDate) dateFilterCreatedAt.$gte = fromDate;
  if (toDate) dateFilterCreatedAt.$lte = toDate;

  const classes = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId) }).select('_id startDate status');
  const classIds = classes.map((c) => c._id);

  const attendanceQuery: any = { finalClass: { $in: classIds } };
  if (hasDateFilter) attendanceQuery.sessionDate = dateFilterCreatedAt;

  const [totalAttendance, approvedAttendance] = await Promise.all([
    Attendance.countDocuments(attendanceQuery),
    Attendance.countDocuments({
      ...attendanceQuery,
      status: { $in: [ATTENDANCE_STATUS.COORDINATOR_APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED] as any },
    }),
  ]);
  const attendanceApprovalRate = totalAttendance > 0 ? Math.round((approvedAttendance / totalAttendance) * 100) : 0;

  const classDateFieldFilter: any = hasDateFilter ? { startDate: dateFilterCreatedAt } : {};
  const baseClassQuery: any = { coordinator: new mongoose.Types.ObjectId(coordinatorUserId), ...classDateFieldFilter };

  const [activeClassesCount, completedClassesCount, pausedClassesCount] = await Promise.all([
    FinalClass.countDocuments({ ...baseClassQuery, status: FINAL_CLASS_STATUS.ACTIVE }),
    FinalClass.countDocuments({ ...baseClassQuery, status: FINAL_CLASS_STATUS.COMPLETED }),
    FinalClass.countDocuments({ ...baseClassQuery, status: FINAL_CLASS_STATUS.PAUSED }),
  ]);

  const pendingApprovals = await getPendingApprovalsForCoordinator(coordinatorUserId);
  const pendingApprovalsCount = Array.isArray(pendingApprovals)
    ? pendingApprovals.length
    : (((pendingApprovals as any)?.total) || ((pendingApprovals as any)?.data?.length) || 0);

  const todaysTasks = await getCoordinatorTodaysTasks(coordinatorUserId);
  const todaysTasksCount = (todaysTasks?.counts?.pendingAttendance || 0) + (todaysTasks?.counts?.paymentReminders || 0) + (todaysTasks?.counts?.testsToSchedule || 0) + (todaysTasks?.counts?.parentComplaints || 0);

  return {
    coordinator,
    totalClassesHandled: coordinator.totalClassesHandled,
    activeClassesCount,
    completedClassesCount,
    pausedClassesCount,
    attendanceApprovalRate,
    performanceScore: coordinator.performanceScore,
    availableCapacity: coordinator.availableCapacity,
    maxClassCapacity: coordinator.maxClassCapacity,
    pendingApprovalsCount,
    todaysTasksCount,
    specialization: coordinator.specialization,
    joiningDate: coordinator.joiningDate,
    isActive: coordinator.isActive,
  };
};

export const getCoordinatorTodaysTasks = async (coordinatorUserId: string) => {
  const pendingAttendance = await getPendingApprovalsForCoordinator(coordinatorUserId);
  const pendingAttendanceApprovals = Array.isArray(pendingAttendance) ? pendingAttendance : (((pendingAttendance as any)?.data) || []);

  const now = new Date();
  const paymentReminders = await Payment.aggregate([
    { $match: { status: { $in: [PAYMENT_STATUS.PENDING, 'OVERDUE'] as any }, dueDate: { $lte: now } } },
    { $lookup: { from: 'finalclasses', localField: 'finalClass', foreignField: '_id', as: 'finalClass' } },
    { $unwind: '$finalClass' },
    { $match: { 'finalClass.coordinator': new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $sort: { dueDate: 1 } },
  ]);

  const tasks = {
    pendingAttendanceApprovals: pendingAttendanceApprovals,
    paymentReminders,
    testsToSchedule: [],
    parentComplaints: [],
    counts: {
      pendingAttendance: pendingAttendanceApprovals.length || 0,
      paymentReminders: paymentReminders.length || 0,
      testsToSchedule: 0,
      parentComplaints: 0,
    },
  };

  return tasks;
};

export const getAssignedClassesSummary = async (
  coordinatorUserId: string,
  filters: { status?: string; subject?: string; grade?: string; page: number; limit: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
) => {
  const baseQuery: any = { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) };
  if (filters.status) baseQuery.status = filters.status;
  if (filters.subject) baseQuery.subjects = { $in: [filters.subject] } as any;
  if (filters.grade) baseQuery.grade = filters.grade;

  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const skip = (page - 1) * limit;
  const sortField = filters.sortBy || 'startDate';
  const sortDir = filters.sortOrder === 'asc' ? 1 : -1;
  const sort: any = { [sortField]: sortDir };

  const [classes, total] = await Promise.all([
    FinalClass.find(baseQuery)
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
    FinalClass.countDocuments(baseQuery),
  ]);

  const now = new Date();
  const enriched = await Promise.all(
    classes.map(async (cls: any) => {
      const pendingAttendanceCount = await Attendance.countDocuments({ finalClass: cls._id, status: ATTENDANCE_STATUS.PENDING });
      const overduePayments = await Payment.countDocuments({ finalClass: cls._id, status: PAYMENT_STATUS.PENDING, dueDate: { $lt: now } });
      const totalSessions = cls.totalSessions || 0;
      const completedSessions = cls.completedSessions || 0;
      const progressPercentage = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
      return {
        ...cls.toObject(),
        metrics: {
          progressPercentage,
          pendingAttendanceCount,
          overduePaymentsCount: overduePayments,
        },
      };
    })
  );

  const statusBreakdown = classes.reduce<Record<string, number>>((acc: any, cls: any) => {
    acc[cls.status] = (acc[cls.status] || 0) + 1;
    return acc;
  }, {});

  return {
    classes: enriched,
    total,
    page,
    limit,
    statusBreakdown,
    filters,
  };
};

export const getAllCoordinators = async (args: {
  page: number;
  limit: number;
  isActive?: boolean;
  hasCapacity?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, isActive, hasCapacity, sortBy, sortOrder } = args;
  const query: any = {};
  if (typeof isActive === 'boolean') query.isActive = isActive;
  if (hasCapacity) {
    query.$expr = { $lt: ['$activeClassesCount', '$maxClassCapacity'] };
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [coordinators, total] = await Promise.all([
    Coordinator.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate({ path: 'user', select: 'name email phone role' }),
    Coordinator.countDocuments(query),
  ]);

  return { coordinators, total, page, limit };
};

export const getCoordinatorById = async (coordinatorId: string) => {
  const coordinator = await Coordinator.findById(coordinatorId).populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'assignedClasses' },
  ]);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
  return coordinator;
};

export const getCoordinatorByUserId = async (userId: string) => {
  const coordinator = await Coordinator.findOne({ user: userId }).populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'assignedClasses' },
  ]);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
  return coordinator;
};

export const updateCoordinator = async (
  coordinatorId: string,
  updateData: Partial<{ specialization: string[]; maxClassCapacity: number; isActive: boolean }>,
  managerUserId?: string
) => {
  const coordinator = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  if (updateData.maxClassCapacity !== undefined && updateData.maxClassCapacity < coordinator.activeClassesCount) {
    throw new ErrorResponse('maxClassCapacity cannot be less than active classes', 400);
  }

  Object.assign(coordinator, updateData);
  await coordinator.save();
  await coordinator.populate({ path: 'user', select: 'name email phone role' });
  if (managerUserId) {
    try {
      await logManagerActivity(
        managerUserId,
        MANAGER_ACTION_TYPE.UPDATE_COORDINATOR,
        `Updated coordinator profile for ${(coordinator as any).user?.name || ''}`,
        { entityType: 'Coordinator', entityId: String(coordinator._id), entityName: (coordinator as any).user?.name },
        updateData
      );
    } catch {}
  }
  return coordinator;
};

export const deleteCoordinator = async (coordinatorId: string) => {
  const coordinator = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
  if (coordinator.activeClassesCount > 0) {
    throw new ErrorResponse('Cannot delete coordinator with active classes', 400);
  }
  await Coordinator.findByIdAndDelete(coordinatorId);
  return true;
};

export const getCoordinatorWorkload = async (coordinatorId: string) => {
  const coordinator = await Coordinator.findById(coordinatorId).populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'assignedClasses' },
  ]);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  const classes = await FinalClass.find({ coordinator: coordinator.user });
  const statusBreakdown = classes.reduce<Record<string, number>>((acc, cls) => {
    acc[cls.status] = (acc[cls.status] || 0) + 1;
    return acc;
  }, {});

  return {
    coordinator,
    activeClassesCount: coordinator.activeClassesCount,
    totalClassesHandled: coordinator.totalClassesHandled,
    availableCapacity: (coordinator.maxClassCapacity || 0) - (coordinator.activeClassesCount || 0),
    statusBreakdown,
    assignedClasses: classes,
  };
};

export const getAvailableCoordinators = async (requiredCapacity = 1) => {
  const result = await Coordinator.find({
    isActive: true,
    $expr: { $gte: [{ $subtract: ['$maxClassCapacity', '$activeClassesCount'] }, requiredCapacity] },
  })
    .sort({ maxClassCapacity: -1, activeClassesCount: 1 })
    .populate({ path: 'user', select: 'name email phone role' });
  return result;
};

export const getEligibleCoordinatorUsers = async () => {
  const existing = await Coordinator.find().select('user');
  const existingIds = existing.map((c: any) => c.user);
  const users = await User.find({ role: USER_ROLES.COORDINATOR, _id: { $nin: existingIds } }).select('name email role');
  return users;
};

export default {
  createCoordinator,
  getAllCoordinators,
  getCoordinatorById,
  getCoordinatorByUserId,
  updateCoordinator,
  deleteCoordinator,
  getCoordinatorWorkload,
  getAvailableCoordinators,
  getCoordinatorPaymentSummary,
  getCoordinatorProfileMetrics,
  getEligibleCoordinatorUsers,
};
