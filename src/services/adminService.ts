import mongoose from 'mongoose';
import Admin from '../models/Admin';
import User from '../models/User';
import Manager from '../models/Manager';
import Coordinator from '../models/Coordinator';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Tutor from '../models/Tutor';
import Attendance from '../models/Attendance';
import ErrorResponse from '../utils/errorResponse';
import { getOverallStatistics, getCumulativeClassGrowth, getPendingApprovals } from './dashboardService';
import { registerUser } from './authService';
import { createManagerProfile } from './managerService';
import { createCoordinator } from './coordinatorService';
import { USER_ROLES, PAYMENT_STATUS, VERIFICATION_STATUS } from '../config/constants';

// Helper: copied pattern from managerService
const buildDateMatch = (field: string, fromDate?: Date, toDate?: Date) => {
  const match: Record<string, any> = {};
  if (fromDate || toDate) {
    const range: Record<string, any> = {};
    if (fromDate) range.$gte = new Date(fromDate);
    if (toDate) range.$lte = new Date(toDate);
    match[field] = range;
  }
  return match;
};

// Section 1: CRUD Operations
export const createAdminProfile = async (userId: string, department?: string) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);
  if (user.role !== USER_ROLES.ADMIN) throw new ErrorResponse('User is not an admin', 400);

  const exists = await Admin.findOne({ user: userId });
  if (exists) throw new ErrorResponse('Admin profile already exists', 409);

  const admin = await Admin.create({
    user: new mongoose.Types.ObjectId(userId),
    department: department || undefined,
    joiningDate: new Date(),
  });

  await admin.populate({ path: 'user', select: 'name email role phone' });
  return admin;
};

export const getAllAdmins = async (args: { page: number; limit: number; isActive?: boolean; sortBy?: string; sortOrder?: 'asc' | 'desc' }) => {
  const { page, limit, isActive, sortBy, sortOrder } = args;
  const query: Record<string, any> = {};
  if (typeof isActive === 'boolean') query.isActive = isActive;

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const direction = sortOrder === 'asc' ? 1 : -1;

  const [admins, total] = await Promise.all([
    Admin.find(query)
      .populate({ path: 'user', select: 'name email role phone' })
      .sort({ [sortField]: direction })
      .skip(skip)
      .limit(limit),
    Admin.countDocuments(query),
  ]);

  return { admins, total, page, limit };
};

export const getAdminById = async (adminId: string) => {
  const admin = await Admin.findById(adminId).populate({ path: 'user', select: 'name email role phone' });
  if (!admin) throw new ErrorResponse('Admin not found', 404);
  return admin;
};

export const getAdminByUserId = async (userId: string) => {
  const admin = await Admin.findOne({ user: userId }).populate({ path: 'user', select: 'name email role phone' });
  if (!admin) throw new ErrorResponse('Admin not found', 404);
  return admin;
};

export const updateAdminProfile = async (
  adminId: string,
  updateData: Partial<{ department: string; isActive: boolean }>
) => {
  const admin = await Admin.findById(adminId);
  if (!admin) throw new ErrorResponse('Admin not found', 404);
  Object.assign(admin, updateData);
  await admin.save();
  await admin.populate({ path: 'user', select: 'name email role phone' });
  return admin;
};

export const updateAdminSettings = async (
  adminId: string,
  settingsData: Partial<{
    systemPreferences: {
      maintenanceMode?: boolean;
      allowBulkOperations?: boolean;
      requireApprovalForDeletes?: boolean;
      sessionTimeout?: number;
    };
    dataExportSettings: {
      autoBackupEnabled?: boolean;
      backupFrequency?: string;
      exportFormats?: string[];
      includeDeletedRecords?: boolean;
    };
    auditLogPreferences: {
      logLevel?: string;
      retentionDays?: number;
      alertOnCriticalActions?: boolean;
      emailDigestFrequency?: string;
    };
    notificationSettings: {
      systemAlerts?: boolean;
      userCreations?: boolean;
      bulkOperations?: boolean;
      securityEvents?: boolean;
    };
  }>
) => {
  const admin: any = await Admin.findById(adminId);
  if (!admin) throw new ErrorResponse('Admin not found', 404);

  const currentSettings: any = admin.settings || {};
  admin.settings = {
    ...currentSettings,
    ...settingsData,
    systemPreferences: {
      ...(currentSettings.systemPreferences || {}),
      ...(settingsData.systemPreferences || {}),
    },
    dataExportSettings: {
      ...(currentSettings.dataExportSettings || {}),
      ...(settingsData.dataExportSettings || {}),
    },
    auditLogPreferences: {
      ...(currentSettings.auditLogPreferences || {}),
      ...(settingsData.auditLogPreferences || {}),
    },
    notificationSettings: {
      ...(currentSettings.notificationSettings || {}),
      ...(settingsData.notificationSettings || {}),
    },
  };

  await admin.save();
  await admin.populate({ path: 'user', select: 'name email role phone' });
  return admin;
};

export const deleteAdminProfile = async (adminId: string) => {
  const admin = await Admin.findById(adminId);
  if (!admin) throw new ErrorResponse('Admin not found', 404);
  if ((admin as any).usersCreated && (admin as any).usersCreated > 0) {
    throw new ErrorResponse('Cannot delete admin with existing records', 400);
  }
  await Admin.findByIdAndDelete(adminId);
  return true;
};

// Section 2: System-Wide Analytics
export const getSystemWideAnalytics = async (fromDate?: Date, toDate?: Date) => {
  // Some dashboard functions may expect non-optional dates; pass through with safe casting
  const base = await getOverallStatistics(fromDate as any, toDate as any);

  const dateMatchPayment = buildDateMatch('paymentDate', fromDate, toDate);
  const dateMatchUser = buildDateMatch('createdAt', fromDate, toDate);

  // User statistics by role
  const userByRole = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  const userStats: any = {
    ADMIN: { count: 0, active: 0 },
    MANAGER: { count: 0, active: 0 },
    COORDINATOR: { count: 0, active: 0 },
    TUTOR: { count: 0, active: 0 },
    PARENT: { count: 0, active: 0 },
  };
  userByRole.forEach((r) => {
    const key = r._id;
    if (userStats[key]) {
      userStats[key].count = r.count;
      userStats[key].active = r.active;
    }
  });
  const totalUsers = Object.values(userStats).reduce((acc: number, v: any) => acc + (v as any).count, 0);
  const totalActiveUsers = Object.values(userStats).reduce((acc: number, v: any) => acc + (v as any).active, 0);

  // Manager performance summary
  const activeManagers = await Manager.countDocuments({ isActive: true });
  const managerAgg = await Manager.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalLeads: { $sum: '$classLeadsCreated' },
        totalClasses: { $sum: '$classesConverted' },
        totalRevenue: { $sum: '$revenueGenerated' },
      },
    },
  ]);
  const managerPerf = managerAgg[0] || { totalLeads: 0, totalClasses: 0, totalRevenue: 0 };
  const managerAverages = {
    perManagerLeads: activeManagers ? managerPerf.totalLeads / activeManagers : 0,
    perManagerClasses: activeManagers ? managerPerf.totalClasses / activeManagers : 0,
    perManagerRevenue: activeManagers ? managerPerf.totalRevenue / activeManagers : 0,
  };

  // Coordinator performance summary
  const activeCoordinators = await Coordinator.countDocuments({ isActive: true });
  const coordAgg = await Coordinator.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalClasses: { $sum: '$totalClassesHandled' },
        avgScore: { $avg: '$performanceScore' },
        totalActiveClasses: { $sum: '$activeClassesCount' },
        totalMaxCapacity: { $sum: '$maxClassCapacity' },
      },
    },
  ]);
  const coord = coordAgg[0] || { totalClasses: 0, avgScore: 0, totalActiveClasses: 0, totalMaxCapacity: 0 };
  const coordinatorMetrics = {
    activeCoordinators,
    totalClasses: coord.totalClasses,
    avgScore: coord.avgScore || 0,
    avgCapacityUtilization:
      coord.totalMaxCapacity > 0 ? (coord.totalActiveClasses / coord.totalMaxCapacity) * 100 : 0,
  };

  // Tutor performance summary
  const tutorAgg = await Tutor.aggregate([
    {
      $group: {
        _id: '$verificationStatus',
        count: { $sum: 1 },
        totalClasses: { $sum: '$classesAssigned' },
        avgRating: { $avg: '$ratings' },
      },
    },
  ]);
  const tutorStats: Record<string, any> = {};
  tutorAgg.forEach((t) => {
    tutorStats[t._id || 'UNKNOWN'] = {
      count: t.count || 0,
      totalClasses: t.totalClasses || 0,
      avgRating: t.avgRating || 0,
    };
  });

  // Financial summary
  const paidRevenueAgg = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.PAID, ...dateMatchPayment } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const pendingRevenueAgg = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.PENDING, ...dateMatchPayment } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const overdueRevenueAgg = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.OVERDUE, ...dateMatchPayment } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const paidRevenue = (paidRevenueAgg[0]?.total as number) || 0;
  const pendingRevenue = (pendingRevenueAgg[0]?.total as number) || 0;
  const overdueRevenue = (overdueRevenueAgg[0]?.total as number) || 0;
  const grossRevenue = paidRevenue + pendingRevenue + overdueRevenue;
  const collectionRate = grossRevenue > 0 ? (paidRevenue / grossRevenue) * 100 : 0;

  // Growth metrics
  const classGrowth = await getCumulativeClassGrowth(fromDate as any, toDate as any);

  const userGrowth = await User.aggregate([
    { $match: { ...dateMatchUser } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const revenueGrowth = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.PAID, ...dateMatchPayment } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // System health indicators
  const pendingApprovals = await getPendingApprovals();
  const overduePayments = await Payment.countDocuments({ status: PAYMENT_STATUS.PENDING, dueDate: { $lt: new Date() } });

  const inactiveUsersByRole: Record<string, number> = {};
  await Promise.all(
    [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT].map(async (role) => {
      inactiveUsersByRole[role] = await User.countDocuments({ role, isActive: false });
    })
  );

  const pendingTutorVerifications = await Tutor.countDocuments({ verificationStatus: VERIFICATION_STATUS.PENDING });

  return {
    base,
    users: {
      byRole: userStats,
      totals: { totalUsers, totalActiveUsers },
      growth: userGrowth,
    },
    managers: {
      activeManagers,
      totals: managerPerf,
      averages: managerAverages,
    },
    coordinators: coordinatorMetrics,
    tutors: tutorStats,
    finance: {
      paidRevenue,
      pendingRevenue,
      overdueRevenue,
      grossRevenue,
      collectionRate,
      growth: revenueGrowth,
    },
    classes: {
      growth: classGrowth,
    },
    health: {
      pendingApprovals,
      overduePayments,
      inactiveUsersByRole,
      pendingTutorVerifications,
    },
  };
};

// Section 3: Bulk Data Operations
export const bulkUpdateUsers = async (
  filter: { role?: string; isActive?: boolean; ids?: string[] },
  updateData: Partial<{ isActive: boolean }>,
  adminUserId: string
) => {
  // safety: only allow specific fields
  const allowed = ['isActive'];
  const keys = Object.keys(updateData || {});
  if (!keys.every((k) => allowed.includes(k))) throw new ErrorResponse('Invalid update fields for users', 400);

  if (filter.role === USER_ROLES.ADMIN) {
    throw new ErrorResponse('Bulk updates to admin users are not allowed', 400);
  }

  const query: any = {};
  if (filter.role) query.role = filter.role;
  if (typeof filter.isActive === 'boolean') query.isActive = filter.isActive;
  if (filter.ids && filter.ids.length) query._id = { $in: filter.ids.map((id) => new mongoose.Types.ObjectId(id)) };

  const result = await User.updateMany(query, { $set: updateData });
  await Admin.findOneAndUpdate(
    { user: adminUserId },
    { $inc: { dataModifications: 1, systemActionsPerformed: 1, usersModified: result.modifiedCount || 0 } }
  );

  return { modifiedCount: (result as any).modifiedCount || 0, filter, updateData };
};

export const bulkUpdateManagers = async (
  filter: { isActive?: boolean; department?: string; ids?: string[] },
  updateData: Partial<{ isActive: boolean; department: string }>,
  adminUserId: string
) => {
  const allowed = ['isActive', 'department'];
  const keys = Object.keys(updateData || {});
  if (!keys.every((k) => allowed.includes(k))) throw new ErrorResponse('Invalid update fields for managers', 400);

  const query: any = {};
  if (typeof filter.isActive === 'boolean') query.isActive = filter.isActive;
  if (filter.department) query.department = filter.department;
  if (filter.ids && filter.ids.length) query._id = { $in: filter.ids.map((id) => new mongoose.Types.ObjectId(id)) };

  const result = await Manager.updateMany(query, { $set: updateData });
  await Admin.findOneAndUpdate(
    { user: adminUserId },
    { $inc: { dataModifications: 1, systemActionsPerformed: 1 } }
  );

  return { modifiedCount: (result as any).modifiedCount || 0, filter, updateData };
};

export const bulkUpdateCoordinators = async (
  filter: { isActive?: boolean; ids?: string[] },
  updateData: Partial<{ isActive: boolean; maxClassCapacity: number }>,
  adminUserId: string
) => {
  const allowed = ['isActive', 'maxClassCapacity'];
  const keys = Object.keys(updateData || {});
  if (!keys.every((k) => allowed.includes(k))) throw new ErrorResponse('Invalid update fields for coordinators', 400);

  const query: any = {};
  if (typeof filter.isActive === 'boolean') query.isActive = filter.isActive;
  if (filter.ids && filter.ids.length) query._id = { $in: filter.ids.map((id) => new mongoose.Types.ObjectId(id)) };

  if (typeof updateData.maxClassCapacity === 'number') {
    const invalidCount = await Coordinator.countDocuments({
      ...query,
      activeClassesCount: { $gt: updateData.maxClassCapacity },
    });
    if (invalidCount > 0) throw new ErrorResponse('Cannot set maxClassCapacity below current active classes', 400);
  }

  const result = await Coordinator.updateMany(query, { $set: updateData });
  await Admin.findOneAndUpdate(
    { user: adminUserId },
    { $inc: { dataModifications: 1, systemActionsPerformed: 1 } }
  );

  return { modifiedCount: (result as any).modifiedCount || 0, filter, updateData };
};

export const bulkUpdatePayments = async (
  filter: { status?: string; finalClassId?: string; tutorId?: string; ids?: string[]; fromDate?: Date; toDate?: Date },
  updateData: Partial<{ status: PAYMENT_STATUS; paymentDate: Date; paidBy: string }>,
  adminUserId: string
) => {
  // validate status
  if (updateData.status && !Object.values(PAYMENT_STATUS).includes(updateData.status)) {
    throw new ErrorResponse('Invalid payment status', 400);
  }

  if (updateData.status === PAYMENT_STATUS.PAID) {
    if (!updateData.paymentDate || !updateData.paidBy) {
      throw new ErrorResponse('paymentDate and paidBy are required when marking payments as PAID', 400);
    }
  }

  const query: any = {};
  if (filter.status) query.status = filter.status;
  if (filter.finalClassId) query.finalClass = new mongoose.Types.ObjectId(filter.finalClassId);
  if (filter.tutorId) query.tutor = new mongoose.Types.ObjectId(filter.tutorId);
  if (filter.ids && filter.ids.length) query._id = { $in: filter.ids.map((id) => new mongoose.Types.ObjectId(id)) };

  const dateMatch = buildDateMatch('paymentDate', filter.fromDate, filter.toDate);
  Object.assign(query, dateMatch);

  const result = await Payment.updateMany(query, { $set: updateData });
  await Admin.findOneAndUpdate(
    { user: adminUserId },
    { $inc: { dataModifications: 1, systemActionsPerformed: 1 } }
  );

  return { modifiedCount: (result as any).modifiedCount || 0, filter, updateData };
};

export const bulkDeleteRecords = async (
  entityType: 'ClassLead' | 'Payment' | 'Attendance',
  filter: { ids: string[] },
  adminUserId: string
) => {
  const { ids } = filter;
  if (!ids || !Array.isArray(ids) || ids.length === 0) throw new ErrorResponse('IDs array is required', 400);
  if (ids.length > 100) throw new ErrorResponse('Cannot delete more than 100 records at once', 400);

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  let deletedCount = 0;
  switch (entityType) {
    case 'ClassLead': {
      // safety: ensure not converted to FinalClass
      const convertedCount = await FinalClass.countDocuments({ lead: { $in: objectIds } });
      if (convertedCount > 0) throw new ErrorResponse('Some leads are already converted to final classes', 400);
      const res = await ClassLead.deleteMany({ _id: { $in: objectIds } });
      deletedCount = (res as any).deletedCount || 0;
      break;
    }
    case 'Payment': {
      const res = await Payment.deleteMany({ _id: { $in: objectIds } });
      deletedCount = (res as any).deletedCount || 0;
      break;
    }
    case 'Attendance': {
      const res = await Attendance.deleteMany({ _id: { $in: objectIds } });
      deletedCount = (res as any).deletedCount || 0;
      break;
    }
    default:
      throw new ErrorResponse('Unsupported entity type for bulk delete', 400);
  }

  await Admin.findOneAndUpdate(
    { user: adminUserId },
    { $inc: { dataDeletes: 1, systemActionsPerformed: 1 } }
  );

  return { deletedCount, entityType, ids };
};

// Section 4: User Creation Functions (for Admin)
export const createUserWithRole = async (
  userData: { name: string; email: string; password: string; phone?: string; role: USER_ROLES },
  adminUserId: string
) => {
  if (!Object.values(USER_ROLES).includes(userData.role)) {
    throw new ErrorResponse('Invalid user role', 400);
  }
  // Call registerUser with positional arguments to satisfy its signature
  const regRes: any = await registerUser(
    userData.name,
    userData.email,
    userData.password,
    userData.role,
    userData.phone
  );
  const createdUser: any = regRes?.user ?? regRes;
  const createdUserId: string = createdUser?.id || createdUser?._id?.toString?.();

  const inc: Record<string, number> = { usersCreated: 1, systemActionsPerformed: 1 };
  if (userData.role === USER_ROLES.MANAGER) inc.managersCreated = 1;
  if (userData.role === USER_ROLES.COORDINATOR) inc.coordinatorsCreated = 1;
  if (userData.role === USER_ROLES.TUTOR) inc.tutorsCreated = 1;
  if (userData.role === USER_ROLES.PARENT) inc.parentsCreated = 1;

  await Admin.findOneAndUpdate({ user: adminUserId }, { $inc: inc });

  let profile: any = null;
  if (userData.role === USER_ROLES.MANAGER) {
    profile = await (createManagerProfile as any)(createdUserId);
  } else if (userData.role === USER_ROLES.COORDINATOR) {
    profile = await (createCoordinator as any)(createdUserId);
  }

  return { user: createdUser, profile };
};

export const bulkCreateUsers = async (
  usersData: Array<{ name: string; email: string; password: string; phone?: string; role: USER_ROLES }>,
  adminUserId: string
) => {
  if (!Array.isArray(usersData) || usersData.length === 0) {
    throw new ErrorResponse('usersData must be a non-empty array', 400);
  }
  if (usersData.length > 50) throw new ErrorResponse('Cannot create more than 50 users in one batch', 400);

  const created: Array<{ user: any; profile: any }> = [];
  const failed: Array<{ data: any; error: string }> = [];

  for (const data of usersData) {
    try {
      const res = await createUserWithRole(data, adminUserId);
      created.push(res);
    } catch (err: any) {
      failed.push({ data, error: err?.message || 'Failed to create user' });
    }
  }

  return {
    created,
    failed,
    summary: {
      total: usersData.length,
      successful: created.length,
      failed: failed.length,
    },
  };
};

const exported = {
  createAdminProfile,
  getAllAdmins,
  getAdminById,
  getAdminByUserId,
  updateAdminProfile,
  updateAdminSettings,
  deleteAdminProfile,
  getSystemWideAnalytics,
  bulkUpdateUsers,
  bulkUpdateManagers,
  bulkUpdateCoordinators,
  bulkUpdatePayments,
  bulkDeleteRecords,
  createUserWithRole,
  bulkCreateUsers,
};

export default exported;
