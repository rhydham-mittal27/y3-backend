import mongoose from 'mongoose';
import Manager from '../models/Manager';
import ManagerActivityLog from '../models/ManagerActivityLog';
import User from '../models/User';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import DemoHistory from '../models/DemoHistory';
import Tutor from '../models/Tutor';
import ErrorResponse from '../utils/errorResponse';
import dashboardService from './dashboardService';
import { CLASS_LEAD_STATUS, MANAGER_ACTION_TYPE, PAYMENT_STATUS, USER_ROLES, VERIFICATION_STATUS } from '../config/constants';
import { uploadFileToS3 } from './s3Service';
import { S3_CONFIG } from '../config/s3';

export const createManagerProfile = async (
  userId: string,
  permissions?: {
    canViewSiteLeads?: boolean;
    canVerifyTutors?: boolean;
    canCreateLeads?: boolean;
  }
) => {
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('User not found', 404);
  if (String(user.role) !== USER_ROLES.MANAGER) throw new ErrorResponse('User is not a MANAGER', 400);

  const existing = await Manager.findOne({ user: userId });
  if (existing) throw new ErrorResponse('Manager profile already exists', 409);

  const mgr = await Manager.create({
    user: new mongoose.Types.ObjectId(userId),
    joiningDate: new Date(),
    permissions,
  });
  await mgr.populate({ path: 'user', select: 'name email role phone' });
  return mgr;
};

export const getAllManagers = async (args: {
  page: number;
  limit: number;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, isActive, sortBy, sortOrder } = args;
  const query: any = {};
  if (typeof isActive === 'boolean') query.isActive = isActive;

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [managers, total] = await Promise.all([
    Manager.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate({ path: 'user', select: 'name email phone role' }),
    Manager.countDocuments(query),
  ]);

  return { managers, total, page, limit };
};

export const getManagerById = async (managerId: string) => {
  const mgr = await Manager.findById(managerId).populate({ path: 'user', select: 'name email phone role' });
  if (!mgr) throw new ErrorResponse('Manager not found', 404);
  return mgr;
};

export const getManagerByUserId = async (userId: string) => {
  const mgr = await Manager.findOne({ user: userId }).populate({ path: 'user', select: 'name email phone role' });
  if (!mgr) throw new ErrorResponse('Manager not found', 404);
  return mgr;
};

export const updateManagerProfile = async (
  managerId: string,
  updateData: Partial<{
    isActive: boolean;
    permissions: {
      canViewSiteLeads?: boolean;
      canVerifyTutors?: boolean;
      canCreateLeads?: boolean;
    };
    bio: string;
    languagesKnown: string[];
    skills: string[];
    permanentAddress: string;
    residentialAddress: string;
    documents: any[];
    verificationStatus: string;
  }>
) => {
  const mgr = await Manager.findById(managerId);
  if (!mgr) throw new ErrorResponse('Manager not found', 404);
  Object.assign(mgr, updateData);
  await mgr.save();
  await mgr.populate({ path: 'user', select: 'name email phone role gender city preferredMode' });
  return mgr;
};

export const updateManagerSettings = async (
  managerId: string,
  settingsData: Partial<{
    dashboardPreferences: {
      defaultView?: string;
      defaultDateRange?: string;
      chartPreferences?: string[];
    };
    defaultFilters: {
      leadStatus?: string[];
      classStatus?: string[];
      tutorVerificationStatus?: string;
    };
    notificationSettings: {
      newLeads?: boolean;
      leadConversions?: boolean;
      demoScheduled?: boolean;
      paymentReceived?: boolean;
      tutorVerifications?: boolean;
    };
    reportPreferences: {
      autoExportFrequency?: string;
      exportFormat?: string;
    };
  }>
) => {
  const mgr: any = await Manager.findById(managerId);
  if (!mgr) throw new ErrorResponse('Manager not found', 404);

  const currentSettings: any = mgr.settings || {};
  mgr.settings = {
    ...currentSettings,
    ...settingsData,
    dashboardPreferences: {
      ...(currentSettings.dashboardPreferences || {}),
      ...(settingsData.dashboardPreferences || {}),
    },
    defaultFilters: {
      ...(currentSettings.defaultFilters || {}),
      ...(settingsData.defaultFilters || {}),
    },
    notificationSettings: {
      ...(currentSettings.notificationSettings || {}),
      ...(settingsData.notificationSettings || {}),
    },
    reportPreferences: {
      ...(currentSettings.reportPreferences || {}),
      ...(settingsData.reportPreferences || {}),
    },
  };

  await mgr.save();
  await mgr.populate({ path: 'user', select: 'name email phone role' });
  return mgr;
};

const buildDateMatch = (field: string, fromDate?: Date, toDate?: Date) => {
  const match: any = {};
  if (fromDate || toDate) {
    match[field] = {};
    if (fromDate) match[field].$gte = new Date(fromDate);
    if (toDate) match[field].$lte = new Date(toDate);
  }
  return match;
};

export const getManagerMetrics = async (managerId: string, fromDate?: Date, toDate?: Date) => {
  const manager = await Manager.findById(managerId);
  if (!manager) throw new ErrorResponse('Manager not found', 404);
  const userId = manager.user as unknown as mongoose.Types.ObjectId;

  const leadMatch: any = { createdBy: userId, ...buildDateMatch('createdAt', fromDate, toDate) };
  const classMatch: any = { convertedBy: userId, ...buildDateMatch('convertedAt', fromDate, toDate) };
  const demoMatch: any = { assignedBy: userId, ...buildDateMatch('assignedAt', fromDate, toDate) };
  const paymentMatch: any = { paidBy: userId, status: PAYMENT_STATUS.PAID as any, ...buildDateMatch('paymentDate', fromDate, toDate) };
  const tutorMatch: any = { verifiedBy: userId, ...buildDateMatch('verifiedAt', fromDate, toDate) };

  const [classLeadsCreated, classesConverted, demosScheduled, paymentsProcessed, revenueAgg, tutorsVerified] = await Promise.all([
    ClassLead.countDocuments(leadMatch),
    FinalClass.countDocuments(classMatch),
    DemoHistory.countDocuments(demoMatch),
    Payment.countDocuments(paymentMatch),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Tutor.countDocuments(tutorMatch),
  ]);

  const revenueGenerated = +(revenueAgg?.[0]?.total || 0);
  const conversionRate = classLeadsCreated ? +(100 * (classesConverted || 0) / classLeadsCreated).toFixed(2) : 0;
  const averageRevenuePerClass = classesConverted ? +(revenueGenerated / classesConverted).toFixed(2) : 0;
  const averageDemosPerLead = classLeadsCreated ? +((demosScheduled || 0) / classLeadsCreated).toFixed(2) : 0;

  return {
    classLeadsCreated,
    demosScheduled,
    classesConverted,
    revenueGenerated,
    tutorsVerified,
    coordinatorsCreated: manager.coordinatorsCreated || 0,
    paymentsProcessed,
    conversionRate,
    averageRevenuePerClass,
    averageDemosPerLead,
    dateRange: { from: fromDate, to: toDate },
  };
};

const groupFormat = (groupBy?: 'day' | 'week' | 'month') => {
  switch (groupBy) {
    case 'week':
      return '%Y-%U';
    case 'month':
      return '%Y-%m';
    case 'day':
    default:
      return '%Y-%m-%d';
  }
};

export const getManagerPerformanceHistory = async (
  managerId: string,
  fromDate: Date,
  toDate: Date,
  groupBy: 'day' | 'week' | 'month' = 'month'
) => {
  const manager = await Manager.findById(managerId);
  if (!manager) throw new ErrorResponse('Manager not found', 404);
  const userId = manager.user as unknown as mongoose.Types.ObjectId;

  const fmt = groupFormat(groupBy);

  const [leadsAgg, classesAgg, revenueAgg] = await Promise.all([
    ClassLead.aggregate([
      { $match: { createdBy: userId, ...buildDateMatch('createdAt', fromDate, toDate) } },
      { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    FinalClass.aggregate([
      { $match: { convertedBy: userId, ...buildDateMatch('convertedAt', fromDate, toDate) } },
      { $group: { _id: { $dateToString: { format: fmt, date: '$convertedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { paidBy: userId, status: PAYMENT_STATUS.PAID as any, ...buildDateMatch('paymentDate', fromDate, toDate) } },
      { $group: { _id: { $dateToString: { format: fmt, date: '$paymentDate' } }, revenue: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const map: Record<string, { date: string; leadsCreated: number; classesConverted: number; revenue: number; conversionRate: number }> = {};

  leadsAgg.forEach((l: any) => {
    map[l._id] = map[l._id] || { date: l._id, leadsCreated: 0, classesConverted: 0, revenue: 0, conversionRate: 0 };
    map[l._id].leadsCreated = l.count || 0;
  });
  classesAgg.forEach((c: any) => {
    map[c._id] = map[c._id] || { date: c._id, leadsCreated: 0, classesConverted: 0, revenue: 0, conversionRate: 0 };
    map[c._id].classesConverted = c.count || 0;
  });
  revenueAgg.forEach((r: any) => {
    map[r._id] = map[r._id] || { date: r._id, leadsCreated: 0, classesConverted: 0, revenue: 0, conversionRate: 0 };
    map[r._id].revenue = r.revenue || 0;
  });

  const result = Object.values(map)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      conversionRate: row.leadsCreated ? +(100 * (row.classesConverted || 0) / row.leadsCreated).toFixed(2) : 0,
    }));

  return result;
};

export const getManagerActivityLog = async (
  managerId: string,
  page = 1,
  limit = 20,
  actionType?: MANAGER_ACTION_TYPE,
  fromDate?: Date,
  toDate?: Date,
  entityType?: IRelatedEntityType
) => {
  const mgr = await Manager.findById(managerId);
  if (!mgr) throw new ErrorResponse('Manager not found', 404);
  const managerUserId = mgr.user as unknown as mongoose.Types.ObjectId;
  const query: any = { manager: managerUserId };
  if (actionType) query.actionType = actionType;
  if (fromDate || toDate) {
    query.timestamp = {};
    if (fromDate) query.timestamp.$gte = new Date(fromDate);
    if (toDate) query.timestamp.$lte = new Date(toDate);
  }
  if (entityType) query['relatedEntity.entityType'] = entityType;

  const skip = (page - 1) * limit;

  const [activities, total] = await Promise.all([
    ManagerActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('manager', 'name email'),
    ManagerActivityLog.countDocuments(query),
  ]);

  return { activities, total, page, limit };
};

export const getManagerContribution = async (managerId: string, fromDate?: Date, toDate?: Date) => {
  const manager = await Manager.findById(managerId);
  if (!manager) throw new ErrorResponse('Manager not found', 404);

  const managerMetrics = await getManagerMetrics(managerId, fromDate, toDate);
  const overallMetrics = await dashboardService.getOverallStatistics(fromDate, toDate);

  const leadsPercentage = overallMetrics.classLeads.total
    ? +(100 * (managerMetrics.classLeadsCreated || 0) / overallMetrics.classLeads.total).toFixed(2)
    : 0;
  const conversionsPercentage = overallMetrics.finalClasses.total
    ? +(100 * (managerMetrics.classesConverted || 0) / overallMetrics.finalClasses.total).toFixed(2)
    : 0;
  const revenuePercentage = overallMetrics.payments.totalRevenue
    ? +(100 * (managerMetrics.revenueGenerated || 0) / overallMetrics.payments.totalRevenue).toFixed(2)
    : 0;

  const totalManagers = await Manager.countDocuments({ isActive: true });
  const allManagers = await Manager.find({ isActive: true }).select('_id');

  // Simple ranking by revenue in period
  const rankings = await Promise.all(
    allManagers.map(async (m) => {
      const mm = await getManagerMetrics(String(m._id), fromDate, toDate);
      return { id: String(m._id), revenue: mm.revenueGenerated || 0 };
    })
  );
  rankings.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  const position = Math.max(1, rankings.findIndex((r) => r.id === String(manager._id)) + 1);

  return {
    managerMetrics,
    overallMetrics,
    contributions: {
      leadsPercentage,
      conversionsPercentage,
      revenuePercentage,
    },
    ranking: { position, totalManagers },
  };
};

export const getManagerTodoList = async (managerId: string) => {
  const manager = await Manager.findById(managerId);
  if (!manager) throw new ErrorResponse('Manager not found', 404);

  const userId = manager.user as unknown as mongoose.Types.ObjectId;

  const leads = await ClassLead.find({
    createdBy: userId,
    status: { $ne: CLASS_LEAD_STATUS.CONVERTED as any },
  })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTutor', select: 'name email phone' },
    ]);

  return leads;
};

export type IRelatedEntityType = 'ClassLead' | 'FinalClass' | 'Demo' | 'Payment' | 'Tutor' | 'Coordinator' | 'Announcement';

export const logManagerActivity = async (
  managerId: string,
  actionType: MANAGER_ACTION_TYPE,
  actionDescription: string,
  relatedEntity?: { entityType: IRelatedEntityType; entityId: string; entityName?: string },
  metadata?: any,
  ipAddress?: string,
  userAgent?: string
) => {
  // managerId is the user id of the manager
  const log = await ManagerActivityLog.create({
    manager: new mongoose.Types.ObjectId(managerId),
    actionType,
    actionDescription,
    relatedEntity: relatedEntity
      ? {
          entityType: relatedEntity.entityType,
          entityId: new mongoose.Types.ObjectId(relatedEntity.entityId),
          entityName: relatedEntity.entityName,
        }
      : undefined,
    metadata,
    ipAddress,
    userAgent,
    timestamp: new Date(),
  });

  await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(managerId) }, { $set: { lastActivityAt: new Date() } });
  return log;
};

export const deleteManagerProfile = async (managerId: string) => {
  const mgr = await Manager.findById(managerId);
  if (!mgr) throw new ErrorResponse('Manager not found', 404);
  if ((mgr.classLeadsCreated || 0) > 0) throw new ErrorResponse('Cannot delete manager with existing records', 400);
  await Manager.findByIdAndDelete(managerId);
  return true;
};

export const updateManagerDocuments = async (userId: string, documents: any[]) => {
  const mgr = await Manager.findOne({ user: userId });
  if (!mgr) throw new ErrorResponse('Manager profile not found', 404);

  // Add new documents to existing ones
  mgr.documents = [...(mgr.documents || []), ...documents];
  
  // Update status if it was pending
  if (mgr.verificationStatus === VERIFICATION_STATUS.PENDING) {
    mgr.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
  }
  
  await mgr.save();
  return mgr;
};

export const uploadManagerDocument = async (
  userId: string,
  documentType: string,
  file: any
) => {
  const mgr = await Manager.findOne({ user: userId });
  if (!mgr) throw new ErrorResponse('Manager profile not found', 404);

  const buffer: Buffer = file.buffer;
  const originalname: string = file.originalname;
  const mimetype: string = file.mimetype;

  const uploadResult = await uploadFileToS3(
    buffer,
    originalname,
    mimetype,
    S3_CONFIG.FOLDERS.DOCUMENTS
  );

  const doc = {
    documentType,
    documentUrl: uploadResult.url,
    uploadedAt: new Date(),
    s3Key: uploadResult.key,
    s3Bucket: uploadResult.bucket,
  };

  mgr.documents.push(doc as any);
  
  if (mgr.verificationStatus === VERIFICATION_STATUS.PENDING) {
    mgr.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
  }

  await mgr.save();
  return mgr;
};

export const getEligibleManagerUsers = async () => {
  const managers = await Manager.find({}).select('user');
  const managerUserIds = managers.map((m) => m.user);

  const eligibleUsers = await User.find({
    role: USER_ROLES.MANAGER,
    _id: { $nin: managerUserIds },
    isActive: true,
  }).select('name email phone role');

  return eligibleUsers;
};

export default {
  createManagerProfile,
  getAllManagers,
  getManagerById,
  getManagerByUserId,
  updateManagerProfile,
  updateManagerSettings,
  getManagerMetrics,
  getManagerPerformanceHistory,
  getManagerActivityLog,
  getManagerContribution,
  logManagerActivity,
  deleteManagerProfile,
  getManagerTodoList,
  updateManagerDocuments,
  uploadManagerDocument,
  getEligibleManagerUsers,
};
