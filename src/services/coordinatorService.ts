import mongoose from 'mongoose';
import Coordinator from '../models/Coordinator';
import User from '../models/User';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { USER_ROLES, MANAGER_ACTION_TYPE, FINAL_CLASS_STATUS, PAYMENT_STATUS, ATTENDANCE_STATUS, COORDINATOR_ACTION_TYPE, PAYMENT_TYPE, VERIFICATION_STATUS } from '../config/constants';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import AttendanceSheet from '../models/AttendanceSheet';
import Test from '../models/Test';
import CoordinatorActivityLog from '../models/CoordinatorActivityLog';
import { getPendingApprovalsForCoordinator } from './attendanceService';
import { DOCUMENT_TYPES } from '../config/constants';
import { S3_CONFIG } from '../config/s3';
import { uploadFileToS3Structured, resolveS3DocumentUrl, deleteFileFromS3 } from './s3Service';

const withResolvedCoordinatorDocumentUrls = async (coordinator: any) => {
  if (!coordinator) return coordinator;
  const copy: any = typeof coordinator.toObject === 'function' ? coordinator.toObject() : { ...coordinator };
  const docs = Array.isArray(copy.documents) ? copy.documents : [];
  if (docs.length === 0) return copy;

  copy.documents = await Promise.all(
    docs.map(async (d: any) => {
      const rawKey = String(d?.s3Key || d?.documentUrl || '').trim();
      return {
        ...(d || {}),
        documentUrl: await resolveS3DocumentUrl(rawKey),
      };
    })
  );
  return copy;
};

export const logCoordinatorActivity = async (
  coordinatorUserId: string,
  actionType: COORDINATOR_ACTION_TYPE,
  actionDescription: string,
  relatedEntity?: { entityType: 'FinalClass' | 'Test' | 'Payment' | 'Attendance'; entityId: string; entityName?: string },
  metadata?: any
) => {
  await CoordinatorActivityLog.create({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    actionType,
    actionDescription,
    relatedEntity:
      relatedEntity && relatedEntity.entityId
        ? {
            entityType: relatedEntity.entityType,
            entityId: new mongoose.Types.ObjectId(relatedEntity.entityId),
            entityName: relatedEntity.entityName,
          }
        : undefined,
    metadata,
    timestamp: new Date(),
  });
};

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

export const uploadCoordinatorDocument = async (
  coordinatorId: string,
  documentType: string,
  file: any
) => {
  const coordinator: any = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    throw new ErrorResponse('Invalid document type', 400);
  }

  const buffer: Buffer | undefined = file?.buffer;
  const originalname: string = file?.originalname || 'document';
  const mimetype: string = file?.mimetype || 'application/octet-stream';

  if (!buffer) {
    throw new ErrorResponse('Invalid file upload', 400);
  }

  const uploadResult = await uploadFileToS3Structured(
    buffer,
    originalname,
    mimetype,
    { entityType: 'coordinators', entityId: coordinatorId, folder: S3_CONFIG.FOLDERS.DOCUMENTS }
  );

  const doc = {
    documentType,
    documentUrl: uploadResult.key,
    uploadedAt: new Date(),
    s3Key: uploadResult.key,
    s3Bucket: uploadResult.bucket,
  } as any;

  const previousStatus = coordinator.verificationStatus as VERIFICATION_STATUS;
  if (!Array.isArray(coordinator.documents)) coordinator.documents = [];

  const hasSameType = (coordinator.documents as any[]).some((d) => d?.documentType === documentType);
  if (hasSameType) {
    throw new ErrorResponse(
      'This document type has already been uploaded. Please delete the existing one before uploading again.',
      409
    );
  }
  coordinator.documents.push(doc);

  // If coordinator was pending, move to UNDER_REVIEW because a document was uploaded
  if (previousStatus === VERIFICATION_STATUS.PENDING) {
    coordinator.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
  }

  if (previousStatus === VERIFICATION_STATUS.REJECTED) {
    coordinator.verificationStatus = VERIFICATION_STATUS.UNDER_REVIEW;
    coordinator.verifiedBy = undefined;
    coordinator.verifiedAt = undefined;
  }

  await coordinator.save();
  await coordinator.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return coordinator;
};

export const deleteCoordinatorDocument = async (
  coordinatorId: string,
  documentIndex: number
) => {
  const coordinator: any = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  if (!Array.isArray(coordinator.documents) || documentIndex < 0 || documentIndex >= coordinator.documents.length) {
    throw new ErrorResponse('Invalid document index', 400);
  }

  const doc: any = coordinator.documents[documentIndex];
  if (doc?.s3Key) {
    try {
      await deleteFileFromS3(doc.s3Key);
    } catch {}
  }

  coordinator.documents.splice(documentIndex, 1);
  await coordinator.save();
  await coordinator.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);
  return coordinator;
};

export const updateCoordinatorSettings = async (
  coordinatorId: string,
  settingsData: Partial<{
    classCapacitySettings: {
      preferredMaxCapacity?: number;
      autoAcceptClasses?: boolean;
      capacityAlertThreshold?: number;
    };
    specializationAreas?: string[];
    notificationSettings: {
      attendanceApprovals?: boolean;
      paymentReminders?: boolean;
      testScheduling?: boolean;
      parentComplaints?: boolean;
    };
    workingHours: {
      startTime?: string;
      endTime?: string;
      workingDays?: string[];
    };
  }>
) => {
  const coordinator: any = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  const currentSettings: any = coordinator.settings || {};
  const nextSettings: any = {
    ...currentSettings,
    ...settingsData,
    classCapacitySettings: {
      ...(currentSettings.classCapacitySettings || {}),
      ...(settingsData.classCapacitySettings || {}),
    },
    notificationSettings: {
      ...(currentSettings.notificationSettings || {}),
      ...(settingsData.notificationSettings || {}),
    },
    workingHours: {
      ...(currentSettings.workingHours || {}),
      ...(settingsData.workingHours || {}),
    },
  };

  const preferredMaxCapacity = nextSettings.classCapacitySettings?.preferredMaxCapacity;
  if (typeof preferredMaxCapacity === 'number' && preferredMaxCapacity < (coordinator.activeClassesCount || 0)) {
    throw new ErrorResponse('preferredMaxCapacity cannot be less than active classes', 400);
  }

  coordinator.settings = nextSettings;
  await coordinator.save();
  await coordinator.populate({ path: 'user', select: 'name email phone role' });
  return coordinator;
};

export const getCoordinatorPaymentSummary = async (
  coordinatorUserId: string,
  filters?: { 
    status?: string; 
    classId?: string; 
    paymentType?: string;
    fromDate?: Date; 
    toDate?: Date; 
    page: number; 
    limit: number; 
    sortBy?: string; 
    sortOrder?: 'asc' | 'desc' 
  }
) => {
  const classes = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId) }).select('_id');
  const classIds = classes.map((c) => c._id);

  console.log(`[getCoordinatorPaymentSummary] Coordinator: ${coordinatorUserId}, Found ${classIds.length} classes`);

  const query: any = { finalClass: { $in: classIds } };
  if (filters?.status) query.status = filters.status;
  if (filters?.classId) query.finalClass = new mongoose.Types.ObjectId(filters.classId);
  if (filters?.paymentType) query.paymentType = filters.paymentType;

  console.log(`[getCoordinatorPaymentSummary] Query:`, JSON.stringify(query));

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
        { path: 'attendanceSheet', select: 'periodLabel periodStart periodEnd' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'createdBy', select: 'name email' },
        { path: 'paidBy', select: 'name email' },
      ]),
    Payment.countDocuments(query),
  ]);

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  // Fetch ALL payments for this coordinator's classes to calculate accurate statistics
  const allPayments = await Payment.find({ finalClass: { $in: classIds } });

  const overduePayments = allPayments.filter((p: any) => [PAYMENT_STATUS.PENDING, 'OVERDUE'].includes(p.status) && p.dueDate && p.dueDate < now);
  const upcomingPayments = allPayments.filter((p: any) => p.status === PAYMENT_STATUS.PENDING && p.dueDate && p.dueDate >= now && p.dueDate <= in7Days);
  const paidPayments = allPayments.filter((p: any) => p.status === PAYMENT_STATUS.PAID);

  const amounts = allPayments.reduce(
    (acc: any, p: any) => {
      const isFee = p.paymentType === PAYMENT_TYPE.FEES_COLLECTED || !p.paymentType;
      const isPayout = p.paymentType === PAYMENT_TYPE.TUTOR_PAYOUT;
      
      if (isFee) {
        acc.totalAmount += Number(p.amount) || 0;
        if (p.status === PAYMENT_STATUS.PAID) acc.paidAmount += Number(p.amount) || 0;
        if (p.status === PAYMENT_STATUS.PENDING) acc.pendingAmount += Number(p.amount) || 0;
        if ((p.status as any) === 'OVERDUE') acc.overdueAmount += Number(p.amount) || 0;
      } else if (isPayout) {
        acc.totalPayoutAmount += Number(p.amount) || 0;
        if (p.status === PAYMENT_STATUS.PAID) acc.paidPayoutAmount += Number(p.amount) || 0;
        if (p.status === PAYMENT_STATUS.PENDING || (p.status as any) === 'OVERDUE') acc.pendingPayoutAmount += Number(p.amount) || 0;
      }
      return acc;
    },
    { 
      totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0,
      totalPayoutAmount: 0, paidPayoutAmount: 0, pendingPayoutAmount: 0
    }
  );

  const result = {
    payments,
    total,
    page,
    limit,
    statistics: {
      totalAmount: amounts.totalAmount, // This is total Fees
      paidAmount: amounts.paidAmount,
      pendingAmount: amounts.pendingAmount,
      overdueAmount: amounts.overdueAmount,
      totalPayoutAmount: amounts.totalPayoutAmount,
      paidPayoutAmount: amounts.paidPayoutAmount,
      pendingPayoutAmount: amounts.pendingPayoutAmount,
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
  let coordinator = await Coordinator.findOne({ user: coordinatorUserId });

  // If a coordinator profile does not yet exist for this user but the user
  // has the COORDINATOR role, create a minimal coordinator record on the fly
  // so that freshly promoted coordinators can access their dashboard without
  // going through a separate manual creation step.
  if (!coordinator) {
    const user = await User.findById(coordinatorUserId);
    if (!user) throw new ErrorResponse('User not found', 404);
    if (String(user.role) !== USER_ROLES.COORDINATOR) {
      throw new ErrorResponse('User is not a COORDINATOR', 400);
    }

    coordinator = await Coordinator.create({
      user: new mongoose.Types.ObjectId(coordinatorUserId),
      maxClassCapacity: 10,
    });
  }

  const activeClasses = await FinalClass.find({ coordinator: new mongoose.Types.ObjectId(coordinatorUserId), status: FINAL_CLASS_STATUS.ACTIVE });

  const [pendingIndividualAttendanceCount, pendingAttendanceSheetsCount] = await Promise.all([
    Attendance.countDocuments({
      coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
      status: ATTENDANCE_STATUS.PENDING
    }),
    AttendanceSheet.countDocuments({
      coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
      status: 'PENDING'
    })
  ]);

  const pendingAttendanceApprovalsCount = pendingIndividualAttendanceCount + pendingAttendanceSheetsCount;

  const now = new Date();
  const overduePaymentsAgg = await Payment.aggregate([
    { $match: { status: PAYMENT_STATUS.PENDING, dueDate: { $lt: now } } },
    { $lookup: { from: 'finalclasses', localField: 'finalClass', foreignField: '_id', as: 'fc' } },
    { $unwind: '$fc' },
    { $match: { 'fc.coordinator': new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $count: 'count' },
  ]);
  const overduePaymentsCount = overduePaymentsAgg[0]?.count || 0;

  const todaysTasksCount = pendingAttendanceApprovalsCount + overduePaymentsCount;

  return {
    totalClassesAssigned: Array.isArray((coordinator as any).assignedClasses) ? (coordinator as any).assignedClasses.length : 0,
    activeClassesCount: coordinator.activeClassesCount || activeClasses.length,
    totalClassesHandled: coordinator.totalClassesHandled || 0,
    pendingAttendanceApprovals: pendingAttendanceApprovalsCount,
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

  const [pendingIndividualAttendanceCount, pendingAttendanceSheetsCount] = await Promise.all([
    Attendance.countDocuments({
      coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
      status: ATTENDANCE_STATUS.PENDING
    }),
    AttendanceSheet.countDocuments({
      coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
      status: 'PENDING'
    })
  ]);

  const pendingApprovalsCount = pendingIndividualAttendanceCount + pendingAttendanceSheetsCount;

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
  const pendingAttendanceApprovalsFromRecords = Array.isArray(pendingAttendance) ? pendingAttendance : (((pendingAttendance as any)?.data) || []);

  const pendingSheets = await AttendanceSheet.find({ 
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId), 
    status: 'PENDING' 
  }).populate([
    { path: 'finalClass', populate: { path: 'subject' } },
    { path: 'createdBy', select: 'name email phone' }
  ]);

  const normalizedSheets = pendingSheets.map((sheet: any) => ({
    _id: sheet._id,
    finalClass: sheet.finalClass,
    sessionDate: sheet.submittedAt || sheet.createdAt,
    tutor: sheet.createdBy,
    notes: sheet.periodLabel ? `Monthly Approval for ${sheet.periodLabel}` : 'Monthly Approval Sheet',
    isSheet: true
  }));

  const combinedApprovals = [...pendingAttendanceApprovalsFromRecords, ...normalizedSheets];
  const pendingAttendanceApprovals = combinedApprovals;

  const now = new Date();
  const paymentReminders = await Payment.aggregate([
    { $match: { status: { $in: [PAYMENT_STATUS.PENDING, 'OVERDUE'] as any }, dueDate: { $lte: now } } },
    { $lookup: { from: 'finalclasses', localField: 'finalClass', foreignField: '_id', as: 'finalClass' } },
    { $unwind: '$finalClass' },
    { $match: { 'finalClass.coordinator': new mongoose.Types.ObjectId(coordinatorUserId) } },
    { $sort: { dueDate: 1 } },
  ]);

  // Compute testsToSchedule based on testPerMonth per final class
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const activeClasses = await FinalClass.find({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    status: FINAL_CLASS_STATUS.ACTIVE,
  })
    .select('_id className subject grade testPerMonth')
    .populate('subject', 'label value type');

  const classIds = activeClasses.map((c) => c._id);

  let testsPerClass: Record<string, number> = {};
  if (classIds.length > 0) {
    const testsAgg = await Test.aggregate([
      {
        $match: {
          finalClass: { $in: classIds },
          testDate: { $gte: startOfMonth, $lte: endOfMonth },
          status: { $ne: 'CANCELLED' },
        },
      },
      {
        $group: {
          _id: '$finalClass',
          count: { $sum: 1 },
        },
      },
    ]);

    testsPerClass = testsAgg.reduce((acc: Record<string, number>, item: any) => {
      acc[String(item._id)] = item.count || 0;
      return acc;
    }, {} as Record<string, number>);
  }

  const testsToSchedule = activeClasses
    .filter((cls: any) => {
      const target = typeof cls.testPerMonth === 'number' ? cls.testPerMonth : 1;
      const done = testsPerClass[String(cls._id)] || 0;
      return target > 0 && done < target;
    })
    .map((cls: any) => ({
      finalClassId: cls._id,
      className: cls.className,
      subject: Array.isArray(cls.subject) 
        ? cls.subject.map((s: any) => typeof s === 'object' ? s.label : String(s)).join(', ')
        : (typeof cls.subject === 'object' && cls.subject !== null ? (cls.subject as any).label : String(cls.subject || '')),
      grade: cls.grade,
      testPerMonth: typeof cls.testPerMonth === 'number' ? cls.testPerMonth : 1,
      testsScheduledThisMonth: testsPerClass[String(cls._id)] || 0,
    }));

  const tasks = {
    pendingAttendanceApprovals: pendingAttendanceApprovals,
    paymentReminders,
    testsToSchedule,
    parentComplaints: [],
    counts: {
      pendingAttendance: pendingAttendanceApprovals.length || 0,
      paymentReminders: paymentReminders.length || 0,
      testsToSchedule: testsToSchedule.length || 0,
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
        { path: 'subject', select: 'label value type' },
      ]),
    FinalClass.countDocuments(baseQuery),
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const enriched = await Promise.all(
    classes.map(async (cls: any) => {
      const pendingAttendanceCount = await Attendance.countDocuments({ finalClass: cls._id, status: ATTENDANCE_STATUS.PENDING });
      const overduePaymentsCount = await Payment.countDocuments({ finalClass: cls._id, status: PAYMENT_STATUS.PENDING, dueDate: { $lt: now } });
      const totalSessions =
        (cls as any)?.classLead?.classesPerMonth ??
        (cls as any)?.classesPerMonth ??
        cls.totalSessions ??
        0;

      const completedSessionsThisMonth = await Attendance.countDocuments({
        finalClass: cls._id,
        sessionDate: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: [ATTENDANCE_STATUS.COORDINATOR_APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED] as any },
      });

      const progressPercentage = totalSessions > 0
        ? Math.round((Math.min(completedSessionsThisMonth, totalSessions) / totalSessions) * 100)
        : 0;
      // Compose session progress string
      const sessionProgress = `${completedSessionsThisMonth}/${totalSessions} (${progressPercentage}%)`;
      // Subjects array (ensure array)
      const subjects = Array.isArray(cls.subject) ? cls.subject : (cls.subject ? [cls.subject] : []);
      // Tutor name
      let tutorName = '';
      if (cls.tutor && typeof cls.tutor === 'object' && cls.tutor.name) tutorName = cls.tutor.name;
      else if (cls.tutorName) tutorName = cls.tutorName;
      return {
        ...cls.toObject(),
        subjects,
        tutorName,
        sessionProgress,
        pendingAttendanceCount,
        overduePaymentsCount,
        metrics: {
          progressPercentage,
          completedSessionsThisMonth,
          totalSessionsThisMonth: totalSessions,
          pendingAttendanceCount,
          overduePaymentsCount,
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
  name?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  search?: string;
}) => {
  const { page, limit, isActive, hasCapacity, sortBy, sortOrder, name, email, phone, specialization, search } = args;
  const query: any = {};
  if (typeof isActive === 'boolean') query.isActive = isActive;
  if (hasCapacity) {
    query.$expr = { $lt: ['$activeClassesCount', '$maxClassCapacity'] };
  }

  // Handle user-related filters (name, email, phone, global search)
  if (name || email || phone || (search && !name)) {
    const userQuery: any = { role: USER_ROLES.COORDINATOR };
    
    if (name) userQuery.name = { $regex: name, $options: 'i' };
    if (email) userQuery.email = { $regex: email, $options: 'i' };
    if (phone) userQuery.phone = { $regex: phone, $options: 'i' };
    
    if (search && !name && !email && !phone) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const matchedUsers = await User.find(userQuery).select('_id');
    query.user = { $in: matchedUsers.map(u => u._id) };
  }

  if (specialization) {
    query.specialization = { $regex: specialization, $options: 'i' };
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: any = { [sortField]: sortDir };

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
  return await withResolvedCoordinatorDocumentUrls(coordinator);
};

export const getCoordinatorByUserId = async (userId: string) => {
  const coordinator = await Coordinator.findOne({ user: userId }).populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'assignedClasses' },
  ]);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);
  return await withResolvedCoordinatorDocumentUrls(coordinator);
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

export const getCoordinatorsForVerification = async () => {
  const coordinators = await Coordinator.find({
    verificationStatus: { $in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.UNDER_REVIEW] as any },
  })
    .sort({ updatedAt: 1 })
    .populate([
      { path: 'user', select: 'name email phone role' },
      { path: 'verifiedBy', select: 'name email phone role' },
    ]);

  return await Promise.all(coordinators.map(withResolvedCoordinatorDocumentUrls));
};

export const updateCoordinatorVerificationStatus = async (
  coordinatorId: string,
  newStatus: VERIFICATION_STATUS,
  verificationNotes: string | undefined,
  verifiedBy: string
) => {
  const coordinator: any = await Coordinator.findById(coordinatorId);
  if (!coordinator) throw new ErrorResponse('Coordinator not found', 404);

  const current = coordinator.verificationStatus as VERIFICATION_STATUS;
  const valid = (from: VERIFICATION_STATUS, to: VERIFICATION_STATUS) => {
    if (from === VERIFICATION_STATUS.PENDING && to === VERIFICATION_STATUS.UNDER_REVIEW) return true;
    if (from === VERIFICATION_STATUS.PENDING && (to === VERIFICATION_STATUS.VERIFIED || to === VERIFICATION_STATUS.REJECTED)) return true;
    if (from === VERIFICATION_STATUS.UNDER_REVIEW && (to === VERIFICATION_STATUS.VERIFIED || to === VERIFICATION_STATUS.REJECTED)) return true;
    return false;
  };

  if (!valid(current, newStatus)) {
    throw new ErrorResponse(`Invalid status transition from ${current} to ${newStatus}`, 400);
  }

  coordinator.verificationStatus = newStatus;
  coordinator.verificationNotes = verificationNotes;

  if (newStatus === VERIFICATION_STATUS.VERIFIED || newStatus === VERIFICATION_STATUS.REJECTED) {
    coordinator.verifiedBy = new mongoose.Types.ObjectId(verifiedBy);
    coordinator.verifiedAt = new Date();
  }

  await coordinator.save();

  await coordinator.populate([
    { path: 'user', select: 'name email phone role' },
    { path: 'verifiedBy', select: 'name email phone role' },
  ]);

  try {
    await logManagerActivity(
      verifiedBy,
      MANAGER_ACTION_TYPE.UPDATE_COORDINATOR,
      `Updated coordinator verification status for ${(coordinator as any).user?.name || ''} - status: ${newStatus}`,
      { entityType: 'Coordinator', entityId: String(coordinator._id), entityName: (coordinator as any).user?.name },
      { oldStatus: current, newStatus, verificationNotes }
    );
  } catch {}

  return coordinator;
};

export default {
  createCoordinator,
  getAllCoordinators,
  getCoordinatorById,
  getCoordinatorByUserId,
  updateCoordinator,
  updateCoordinatorSettings,
  deleteCoordinator,
  getCoordinatorWorkload,
  getAvailableCoordinators,
  getCoordinatorPaymentSummary,
  getCoordinatorProfileMetrics,
  getEligibleCoordinatorUsers,
  getCoordinatorsForVerification,
  updateCoordinatorVerificationStatus,
  uploadCoordinatorDocument,
  deleteCoordinatorDocument,
};
