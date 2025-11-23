import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import Attendance from '../models/Attendance';
import Payment from '../models/Payment';
import Test from '../models/Test';
import CoordinatorAnnouncement from '../models/CoordinatorAnnouncement';
import ErrorResponse from '../utils/errorResponse';
import { ATTENDANCE_STATUS, PAYMENT_STATUS, TEST_STATUS, FINAL_CLASS_STATUS } from '../config/constants';

export const getParentDashboardStats = async (parentUserId: string) => {
  if (!mongoose.isValidObjectId(parentUserId)) {
    throw new ErrorResponse('Invalid parent id', 400);
  }

  const parentObjectId = new mongoose.Types.ObjectId(parentUserId);

  const classes = await FinalClass.find({ parent: parentObjectId }).select(
    '_id status totalSessions completedSessions'
  );

  const totalClasses = classes.length;
  const activeClasses = classes.filter((c: any) => String(c.status) === FINAL_CLASS_STATUS.ACTIVE).length;

  const classIds = classes.map((c) => c._id);

  let attendanceSummary = {
    totalSessions: 0,
    approvedCount: 0,
    pendingCount: 0,
    approvalRate: 0,
  };

  if (classIds.length > 0) {
    const attendanceAgg = await Attendance.aggregate([
      { $match: { finalClass: { $in: classIds } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const totalSessions = attendanceAgg.reduce((sum, a: any) => sum + (a.count || 0), 0);
    const approvedCount = attendanceAgg
      .filter((a: any) => a._id === ATTENDANCE_STATUS.PARENT_APPROVED)
      .reduce((sum, a: any) => sum + (a.count || 0), 0);
    const pendingCount = attendanceAgg
      .filter((a: any) => a._id === ATTENDANCE_STATUS.COORDINATOR_APPROVED)
      .reduce((sum, a: any) => sum + (a.count || 0), 0);

    const approvalRate = totalSessions > 0 ? Math.round((approvedCount / totalSessions) * 100) : 0;

    attendanceSummary = {
      totalSessions,
      approvedCount,
      pendingCount,
      approvalRate,
    };
  }

  let paymentSummary = {
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
  };

  if (classIds.length > 0) {
    const payments = await Payment.find({ finalClass: { $in: classIds } }).select('amount status');
    const totalAmount = payments.reduce((sum, p: any) => sum + (p.amount || 0), 0);
    const paidAmount = payments
      .filter((p: any) => String(p.status) === PAYMENT_STATUS.PAID)
      .reduce((sum, p: any) => sum + (p.amount || 0), 0);
    const pendingAmount = payments
      .filter((p: any) => String(p.status) === PAYMENT_STATUS.PENDING)
      .reduce((sum, p: any) => sum + (p.amount || 0), 0);
    const overdueAmount = payments
      .filter((p: any) => String(p.status) === PAYMENT_STATUS.OVERDUE)
      .reduce((sum, p: any) => sum + (p.amount || 0), 0);

    paymentSummary = {
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
    };
  }

  let upcomingTestsCount = 0;
  if (classIds.length > 0) {
    const now = new Date();
    upcomingTestsCount = await Test.countDocuments({
      finalClass: { $in: classIds },
      status: TEST_STATUS.SCHEDULED,
      testDate: { $gte: now },
    });
  }

  return {
    totalClasses,
    activeClasses,
    attendanceSummary,
    paymentSummary,
    upcomingTestsCount,
  };
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

export const getAnnouncementsForParent = async (
  parentUserId: string,
  page: number,
  limit: number,
  fromDate?: Date,
  toDate?: Date
) => {
  if (!mongoose.isValidObjectId(parentUserId)) {
    return { announcements: [], total: 0, page, limit };
  }

  const query: any = {
    recipients: new mongoose.Types.ObjectId(parentUserId),
  };

  if (fromDate || toDate) {
    query.sentAt = {} as any;
    if (fromDate) query.sentAt.$gte = fromDate;
    if (toDate) query.sentAt.$lte = toDate;
  }

  const skip = (page - 1) * limit;

  const [announcements, total] = await Promise.all([
    CoordinatorAnnouncement.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ sentAt: -1 })
      .populate('coordinator', 'name email')
      .populate('targetClass', 'studentName subject grade')
      .populate('targetTutor', 'name email'),
    CoordinatorAnnouncement.countDocuments(query),
  ]);

  return { announcements, total, page, limit };
};

export default {
  getParentDashboardStats,
  getClassesByParent,
  getAnnouncementsForParent,
};

