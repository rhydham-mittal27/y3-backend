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
import { getOverallStatistics, getCumulativeClassGrowth, getPendingApprovals, getDateWiseClassLeads, getRevenueAnalytics } from './dashboardService';
import { registerUser } from './authService';
import { createManagerProfile } from './managerService';
import { createCoordinator } from './coordinatorService';
import { getTutorsForVerification, getPendingTierChanges } from './tutorService';
import { USER_ROLES, PAYMENT_STATUS, VERIFICATION_STATUS, FINAL_CLASS_STATUS, ATTENDANCE_STATUS, PAYMENT_TYPE, CLASS_LEAD_STATUS } from '../config/constants';
import DemoHistory from '../models/DemoHistory';

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
export const getSystemWideAnalytics = async (fromDate?: Date, toDate?: Date, city?: string) => {
  // Some dashboard functions may expect non-optional dates; pass through with safe casting
  const base = await getOverallStatistics(fromDate as any, toDate as any, city);

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
  const revenueAnalytics = await getRevenueAnalytics(fromDate, toDate);
  const {
     paidRevenue,
     pendingRevenue,
     overdueRevenue,
     grossRevenue,
     collectionRate,
     revenueTrends,
     monthlyRevenue 
  } = revenueAnalytics;

  // Map monthlyRevenue to the expected 'growth' shape if needed by frontend or keep it as new shape?
  // Frontend IAdminAnalytics interface for `finance.growth` is `Array<{ month: string; total: number }>`.
  // revenueAnalytics.monthlyRevenue is `Array<{ month: string; revenue: number }>`.
  const revenueGrowth = monthlyRevenue.map((m: any) => ({ month: m.month, total: m.revenue }));

  // Growth metrics
  const classGrowth = await getCumulativeClassGrowth(fromDate as any, toDate as any);

  /* 
   * Tutor Growth Analytics 
   * Aggregate tutors by creation date (month) and segment by status.
   * 'Active' status: Tutors who CURRENTLY have at least one ACTIVE class.
   * We perform aggregation in JS to match ObjectIds reliably.
   */
  const activeTutorUserIds = await FinalClass.distinct('tutor', { status: FINAL_CLASS_STATUS.ACTIVE });
  const activeTutorUserIdStrings = new Set(activeTutorUserIds.map((id: any) => id.toString()));

  const tutorsForGrowth = await Tutor.find(
    buildDateMatch('createdAt', fromDate, toDate),
    'createdAt verificationStatus user'
  ).lean();

  const growthMap: Record<string, { total: number; active: number; verified: number }> = {};

  tutorsForGrowth.forEach((tutor: any) => {
    const month = tutor.createdAt 
      ? new Date(tutor.createdAt).toISOString().slice(0, 10) // 'YYYY-MM-DD'
      : 'Unknown';
    
    if (!growthMap[month]) {
      growthMap[month] = { total: 0, active: 0, verified: 0 };
    }

    const userIdStr = tutor.user ? tutor.user.toString() : '';
    const isVerified = tutor.verificationStatus === VERIFICATION_STATUS.VERIFIED;
    const isActive = activeTutorUserIdStrings.has(userIdStr);

    growthMap[month].total++;
    if (isActive) growthMap[month].active++;
    if (isVerified) growthMap[month].verified++;
  });

  const tutorGrowth = Object.entries(growthMap)
    .map(([month, stats]) => ({
      month,
      total: stats.total,
      active: stats.active,
      verified: stats.verified,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  /*
   * Class Lead & Active Location Growth
   * 1. Leads: Group by Created Month + City + Area
   * 2. Active (Paid): Payments in Month -> FinalClass -> ClassLead (City/Area)
   */
  // 1. Leads
  const leads = await ClassLead.find(buildDateMatch('createdAt', fromDate, toDate), 'createdAt city area').lean();
  
  // 2. Paid Payments (Active Classes Context)
  const paidPayments = await Payment.find(
    { status: PAYMENT_STATUS.PAID, ...dateMatchPayment },
    'paymentDate finalClass'
  ).populate({
    path: 'finalClass',
    select: 'classLead',
    populate: { path: 'classLead', select: 'city area' }
  }).lean();

  // Aggregate
  const locationGrowthMap: Record<string, { month: string; city: string; area: string; leads: number; active: number }> = {};
  const citiesSet = new Set<string>();
  const areasSet = new Set<string>();

  // Process Leads
  leads.forEach((l: any) => {
    const month = l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : 'Unknown';
    const city = l.city || 'Unknown';
    const area = l.area || 'Unknown';
    if (city !== 'Unknown') citiesSet.add(city);
    if (area !== 'Unknown') areasSet.add(area);

    const key = `${month}|${city}|${area}`;
    if (!locationGrowthMap[key]) {
      locationGrowthMap[key] = { month, city, area, leads: 0, active: 0 };
    }
    locationGrowthMap[key].leads++;
  });

  // Process Paid Payments
  paidPayments.forEach((p: any) => {
    const month = p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : 'Unknown';
    // Deep populated path
    const lead = (p.finalClass as any)?.classLead;
    const city = lead?.city || 'Unknown';
    const area = lead?.area || 'Unknown';
    if (city !== 'Unknown') citiesSet.add(city);
    if (area !== 'Unknown') areasSet.add(area);

    const key = `${month}|${city}|${area}`;
    if (!locationGrowthMap[key]) {
      locationGrowthMap[key] = { month, city, area, leads: 0, active: 0 };
    }
    locationGrowthMap[key].active++;
  });

  const locationGrowth = Object.values(locationGrowthMap).sort((a, b) => a.month.localeCompare(b.month));

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
  const [leadsGrowth] = await Promise.all([
    getDateWiseClassLeads(fromDate, toDate, 'day')
  ]);

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
    tutors: {
      ...tutorStats,
      growth: tutorGrowth
    },
    finance: {
      paidRevenue,
      pendingRevenue,
      overdueRevenue,
      grossRevenue,
      collectionRate,
      growth: revenueGrowth,
      revenueTrends,
    },
    classes: {
      leadsGrowth,
      growth: classGrowth,
      locationGrowth: {
        data: locationGrowth,
        cities: Array.from(citiesSet).sort(),
        areas: Array.from(areasSet).sort()
      }
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

export const getApprovalLists = async () => {
  const [attendance, tutors, demos, tierChanges] = await Promise.all([
    // Pending Attendance (needs coordinator or parent)
    Attendance.find({
      status: { $in: [ATTENDANCE_STATUS.PENDING, ATTENDANCE_STATUS.COORDINATOR_APPROVED] },
    })
      .sort({ createdAt: -1 })
      .populate([
        { path: 'finalClass', select: 'className studentName' },
        { path: 'tutor', select: 'name email' },
      ]),

    // Tutors for Verification (status: UNDER_REVIEW)
    getTutorsForVerification(),

    // Scheduled Demos (needs followup)
    DemoHistory.find({ status: 'SCHEDULED' })
      .sort({ scheduledAt: 1 })
      .populate([{ path: 'lead', select: 'studentName subject' }]),

    // Pending Tier Changes
    getPendingTierChanges(),
  ]);

  return {
    attendance,
    tutors,
    demos,
    tierChanges,
  };
};

export const getAdvancedAnalytics = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    payments,
    allStudents,
    allTutors,
    convertedLeads,
    managers,
    coordinators,
  ] = await Promise.all([
    Payment.find({ status: PAYMENT_STATUS.PAID }).lean(),
    User.find({ role: USER_ROLES.PARENT }).lean(), // Assuming Parent is the billing entity
    Tutor.countDocuments({ verificationStatus: VERIFICATION_STATUS.VERIFIED }),
    ClassLead.countDocuments({ status: CLASS_LEAD_STATUS.CONVERTED }),
    Manager.countDocuments({ isActive: true }),
    Coordinator.countDocuments({ isActive: true }),
  ]);

  // 1. Student LTV
  const totalRevenue = payments.reduce((sum, p) => p.paymentType === PAYMENT_TYPE.FEES_COLLECTED ? sum + p.amount : sum, 0);
  const studentLTV = allStudents.length ? totalRevenue / allStudents.length : 0;

  // 2. Student CAC (Synthetic: 10000 per manager + 2000 per lead)
  const totalAcquisitionCost = (managers * 15000);
  const studentCAC = convertedLeads ? totalAcquisitionCost / convertedLeads : 0;

  // 3. Student Monthly Churn (Users with active classes 30d ago vs now)
  // This is a complex one, we'll estimate based on final class closure
  const closedLast30Days = await FinalClass.countDocuments({ 
    status: { $in: [FINAL_CLASS_STATUS.COMPLETED, FINAL_CLASS_STATUS.CANCELLED] },
    updatedAt: { $gte: thirtyDaysAgo }
  });
  const activeStudents = await FinalClass.distinct('classLead', { status: FINAL_CLASS_STATUS.ACTIVE });
  const studentChurn = activeStudents.length ? (closedLast30Days / activeStudents.length) * 100 : 0;

  // 4. Teacher Churn
  const inactiveTeachers = await User.countDocuments({ role: USER_ROLES.TUTOR, isActive: false, updatedAt: { $gte: thirtyDaysAgo } });
  const teacherChurn = allTutors ? (inactiveTeachers / allTutors) * 100 : 0;

  // 5. Avg Teacher Earnings
  const totalTeacherPayouts = payments.reduce((sum, p) => p.paymentType === PAYMENT_TYPE.TUTOR_PAYOUT ? sum + p.amount : sum, 0);
  const activeTutors = await FinalClass.distinct('tutor', { status: FINAL_CLASS_STATUS.ACTIVE });
  const avgTeacherEarnings = activeTutors.length ? totalTeacherPayouts / activeTutors.length : 0;

  // 6. ARPU
  const arpu = activeStudents.length ? totalRevenue / activeStudents.length : 0;

  // 7. Gross Margin
  const totalFees = payments.filter(p => p.paymentType === PAYMENT_TYPE.FEES_COLLECTED).reduce((s, p) => s + p.amount, 0);
  const grossMargin = totalFees ? ((totalFees - totalTeacherPayouts) / totalFees) * 100 : 0;

  // 8. Conversion Rate
  const totalLeads = await ClassLead.countDocuments({});
  const conversionRate = totalLeads ? (convertedLeads / totalLeads) * 100 : 0;

  // 9. Retention (30/60/90) - Users still active after X days
  const getRetention = async (days: number) => {
    const thresholdDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cohort = await User.find({ role: USER_ROLES.PARENT, createdAt: { $lte: thresholdDate } }).lean();
    if (!cohort.length) return 0;
    
    const activeFromCohort = await FinalClass.distinct('parent', { 
      parent: { $in: cohort.map(u => u._id) },
      status: FINAL_CLASS_STATUS.ACTIVE 
    });
    return (activeFromCohort.length / cohort.length) * 100;
  };

  const retention30 = await getRetention(30);
  const retention60 = await getRetention(60);
  const retention90 = await getRetention(90);
  const retention365 = await getRetention(365);

  // 10. Coordinator Cost per Active User
  const totalCoordinatorCost = coordinators * 8000;
  const coordinatorCostPerUser = activeStudents.length ? totalCoordinatorCost / activeStudents.length : 0;

  // 11. Time-to-First-Value (Days from Lead to Converted)
  const convertedLeadsData = await ClassLead.find({ status: CLASS_LEAD_STATUS.CONVERTED }).lean();
  const timeToValue = convertedLeadsData.length 
    ? convertedLeadsData.reduce((sum, l) => sum + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()), 0) / (convertedLeadsData.length * 86400000)
    : 0;



  return {
    studentLTV,
    studentCAC,
    studentChurn,
    teacherChurn,
    teacherCAC: 2500, // Placeholder
    avgTeacherEarnings,
    arpu,
    netRevenueChurn: studentChurn * 0.8, // Simplified estimation
    grossMargin,
    conversionRate,
    retention: { d30: retention30, d60: retention60, d90: retention90, d365: retention365 },
    coordinatorCostPerUser,
    refundRate: 0, // Placeholder as we don't have refund logic yet
    timeToValue
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
  getApprovalLists,
  getAdvancedAnalytics,
};

export default exported;
