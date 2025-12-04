import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import Tutor from '../models/Tutor';
import DemoHistory from '../models/DemoHistory';
import { ATTENDANCE_STATUS, CLASS_LEAD_STATUS, DEMO_STATUS, FINAL_CLASS_STATUS, PAYMENT_STATUS } from '../config/constants';

const buildDateMatch = (field: string, fromDate?: Date, toDate?: Date) => {
  const match: any = {};
  if (fromDate || toDate) {
    match[field] = {};
    if (fromDate) match[field].$gte = new Date(fromDate);
    if (toDate) match[field].$lte = new Date(toDate);
  }
  return match;
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

export const getDateWiseClassLeads = async (
  fromDate?: Date,
  toDate?: Date,
  groupBy: 'day' | 'week' | 'month' = 'day'
) => {
  const match = buildDateMatch('createdAt', fromDate, toDate);
  const fmt = groupFormat(groupBy);

  const pipeline: any[] = [
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$createdAt' } },
        total: { $sum: 1 },
        statuses: { $push: '$status' },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const results = await ClassLead.aggregate(pipeline);
  const data = results.map((r: any) => {
    const breakdown: Record<string, number> = {};
    (r.statuses || []).forEach((s: string) => {
      breakdown[s] = (breakdown[s] || 0) + 1;
    });
    return { date: r._id, total: r.total || 0, statusBreakdown: breakdown };
  });
  return data as Array<{ date: string; total: number; statusBreakdown: Record<string, number> }>;
};

export const getClassLeadStatusDistribution = async (fromDate?: Date, toDate?: Date) => {
  const match = buildDateMatch('createdAt', fromDate, toDate);
  const pipeline: any[] = [
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ];
  const agg = await ClassLead.aggregate(pipeline);
  const total = agg.reduce((s: number, a: any) => s + (a.count || 0), 0) || 1;
  return agg.map((a: any) => ({ status: a._id, count: a.count, percentage: +(100 * (a.count || 0) / total).toFixed(2) }));
};

export const getConversionFunnel = async (fromDate?: Date, toDate?: Date) => {
  const match = buildDateMatch('createdAt', fromDate, toDate);
  const statuses = [
    CLASS_LEAD_STATUS.NEW,
    CLASS_LEAD_STATUS.ANNOUNCED,
    CLASS_LEAD_STATUS.DEMO_SCHEDULED,
    CLASS_LEAD_STATUS.DEMO_COMPLETED,
    CLASS_LEAD_STATUS.CONVERTED,
  ];
  const counts: Record<string, number> = {};
  await Promise.all(
    statuses.map(async (s) => {
      counts[s] = await ClassLead.countDocuments({ ...match, status: s as any });
    })
  );
  const newCount = counts[CLASS_LEAD_STATUS.NEW] || 0;
  const announced = counts[CLASS_LEAD_STATUS.ANNOUNCED] || 0;
  const demoScheduled = counts[CLASS_LEAD_STATUS.DEMO_SCHEDULED] || 0;
  const demoCompleted = counts[CLASS_LEAD_STATUS.DEMO_COMPLETED] || 0;
  const converted = counts[CLASS_LEAD_STATUS.CONVERTED] || 0;

  const stages = [
    { name: 'New Leads', count: newCount, percentage: 100 },
    { name: 'Announced', count: announced, percentage: newCount ? +(100 * announced / newCount).toFixed(2) : 0 },
    { name: 'Demo Scheduled', count: demoScheduled, percentage: announced ? +(100 * demoScheduled / announced).toFixed(2) : 0 },
    { name: 'Demo Completed', count: demoCompleted, percentage: demoScheduled ? +(100 * demoCompleted / demoScheduled).toFixed(2) : 0 },
    { name: 'Converted', count: converted, percentage: demoCompleted ? +(100 * converted / demoCompleted).toFixed(2) : 0 },
  ];
  const overallConversionRate = newCount ? +(100 * converted / newCount).toFixed(2) : 0;
  return { stages, overallConversionRate };
};

export const getFinalClassProgress = async (fromDate?: Date, toDate?: Date) => {
  const match = buildDateMatch('convertedAt', fromDate, toDate);
  const [active, completed, paused, cancelled, total, progressAgg] = await Promise.all([
    FinalClass.countDocuments({ ...match, status: FINAL_CLASS_STATUS.ACTIVE as any }),
    FinalClass.countDocuments({ ...match, status: FINAL_CLASS_STATUS.COMPLETED as any }),
    FinalClass.countDocuments({ ...match, status: FINAL_CLASS_STATUS.PAUSED as any }),
    FinalClass.countDocuments({ ...match, status: FINAL_CLASS_STATUS.CANCELLED as any }),
    FinalClass.countDocuments(match),
    FinalClass.aggregate([
      { $match: match },
      { $group: { _id: null, avg: { $avg: '$progressPercentage' } } },
    ]),
  ]);
  const statusDistribution = [
    { status: FINAL_CLASS_STATUS.ACTIVE, count: active, percentage: total ? +(100 * active / total).toFixed(2) : 0 },
    { status: FINAL_CLASS_STATUS.COMPLETED, count: completed, percentage: total ? +(100 * completed / total).toFixed(2) : 0 },
    { status: FINAL_CLASS_STATUS.PAUSED, count: paused, percentage: total ? +(100 * paused / total).toFixed(2) : 0 },
    { status: FINAL_CLASS_STATUS.CANCELLED, count: cancelled, percentage: total ? +(100 * cancelled / total).toFixed(2) : 0 },
  ];
  const completionRate = total ? +(100 * completed / total).toFixed(2) : 0;
  const averageProgress = +(progressAgg?.[0]?.avg || 0).toFixed(2);
  return {
    totalClasses: total,
    activeClasses: active,
    completedClasses: completed,
    pausedClasses: paused,
    cancelledClasses: cancelled,
    completionRate,
    averageProgress,
    statusDistribution,
  };
};

export const getTutorProgressReport = async (
  page: number,
  limit: number,
  sortBy: string = 'ratings',
  sortOrder: 'asc' | 'desc' = 'desc',
  fromDate?: Date,
  toDate?: Date
) => {
  const skip = (page - 1) * limit;
  const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  const [tutors, total] = await Promise.all([
    Tutor.find({}).populate([{ path: 'user' }]).skip(skip).limit(limit).sort(sort),
    Tutor.countDocuments({}),
  ]);

  const tutorMetrics = await Promise.all(
    tutors.map(async (t: any) => {
      // NOTE: FinalClass, Payment and Attendance models reference the tutor as a User _id,
      // so we must match on t.user (ObjectId of User) instead of the Tutor document _id.
      const tutorUserId = t.user?._id as mongoose.Types.ObjectId;
      const classMatch: any = { tutor: tutorUserId };
      if (fromDate || toDate) {
        classMatch.convertedAt = {};
        if (fromDate) classMatch.convertedAt.$gte = new Date(fromDate);
        if (toDate) classMatch.convertedAt.$lte = new Date(toDate);
      }
      const paymentMatch: any = { tutor: tutorUserId };
      if (fromDate || toDate) {
        paymentMatch.createdAt = {};
        if (fromDate) paymentMatch.createdAt.$gte = new Date(fromDate);
        if (toDate) paymentMatch.createdAt.$lte = new Date(toDate);
      }

      const [classesCompleted, revenueAgg, attendanceAgg] = await Promise.all([
        FinalClass.countDocuments({ ...classMatch, status: FINAL_CLASS_STATUS.COMPLETED as any }),
        Payment.aggregate([
          { $match: { ...paymentMatch } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$amount' },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$status', PAYMENT_STATUS.PAID] }, '$amount', 0] },
              },
            },
          },
        ]),
        Attendance.aggregate([
          { $match: { tutor: tutorUserId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
      ]);

      const attMap: Record<string, number> = {};
      attendanceAgg.forEach((a: any) => (attMap[a._id] = a.count));
      const totalAtt = Object.values(attMap).reduce((s, n) => s + n, 0) || 1;
      const attendanceApprovalRate = +(
        100 * ((attMap[ATTENDANCE_STATUS.PARENT_APPROVED] || 0) / totalAtt)
      ).toFixed(2);

      // Approximate rating fields from tutor
      const averageRating = t.ratings || 0;
      const demoApprovalRatio = +(
        100 * ((t.demosApproved || 0) / Math.max(1, t.demosTaken || 0))
      ).toFixed(2);

      return {
        tutor: t,
        classesCompleted,
        totalRevenue: +(revenueAgg?.[0]?.totalRevenue || 0).toFixed(2),
        averageRating,
        demoApprovalRatio,
        attendanceApprovalRate,
      };
    })
  );

  // Sorting on computed fields if needed
  const sortable = ['classesCompleted', 'revenue', 'ratings', 'experienceHours'];
  const key = sortBy === 'revenue' ? 'totalRevenue' : sortBy === 'ratings' ? 'averageRating' : sortBy;
  if (!sortable.includes(sortBy)) {
    tutorMetrics.sort((a: any, b: any) => (b.averageRating || 0) - (a.averageRating || 0));
  } else {
    tutorMetrics.sort((a: any, b: any) => {
      const av = (a as any)[key] || 0;
      const bv = (b as any)[key] || 0;
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
  }

  return { tutors: tutorMetrics, total, page, limit };
};

export const getCumulativeClassGrowth = async (
  fromDate: Date,
  toDate: Date,
  groupBy: 'day' | 'week' | 'month' = 'day'
) => {
  const fmt = groupFormat(groupBy);
  const match = buildDateMatch('convertedAt', fromDate, toDate);
  const agg = await FinalClass.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: fmt, date: '$convertedAt' } }, newClasses: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  let cumulative = 0;
  return agg.map((a: any) => {
    cumulative += a.newClasses || 0;
    return { date: a._id, newClasses: a.newClasses || 0, cumulativeClasses: cumulative };
  });
};

export const getPendingApprovals = async () => {
  const [coordinatorPending, parentPending, scheduledDemos] = await Promise.all([
    Attendance.countDocuments({ status: ATTENDANCE_STATUS.PENDING as any }),
    Attendance.countDocuments({ status: ATTENDANCE_STATUS.COORDINATOR_APPROVED as any }),
    DemoHistory.countDocuments({ status: DEMO_STATUS.SCHEDULED as any }),
  ]);
  const attendance = {
    coordinatorPending,
    parentPending,
    total: coordinatorPending + parentPending,
  };
  const demos = { scheduledCount: scheduledDemos };
  const totalPending = attendance.total + demos.scheduledCount;
  return { attendance, demos, totalPending };
};

export const getRevenueAnalytics = async (
  fromDate?: Date,
  toDate?: Date,
  groupBy: 'day' | 'week' | 'month' = 'month'
) => {
  const match = buildDateMatch('createdAt', fromDate, toDate);
  const fmt = groupFormat(groupBy);
  const [statusAgg, byDate, byTutor, monthly] = await Promise.all([
    Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          paidRevenue: { $sum: { $cond: [{ $eq: ['$status', PAYMENT_STATUS.PAID] }, '$amount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$tutor', totalRevenue: { $sum: '$amount' } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const totals = statusAgg.reduce(
    (acc: any, cur: any) => {
      const amt = cur.amount || 0;
      if (cur._id === PAYMENT_STATUS.PAID) acc.paidRevenue += amt;
      if (cur._id === PAYMENT_STATUS.PENDING) acc.pendingRevenue += amt;
      if (cur._id === PAYMENT_STATUS.OVERDUE) acc.overdueRevenue += amt;
      acc.totalRevenue += amt;
      return acc;
    },
    { totalRevenue: 0, paidRevenue: 0, pendingRevenue: 0, overdueRevenue: 0 }
  );

  // resolve tutor names
  const tutorsMap: Record<string, any> = {};
  const tutorIds = byTutor.map((t: any) => t._id).filter(Boolean);
  if (tutorIds.length) {
    const tutors = await Tutor.find({ _id: { $in: tutorIds } }).populate([{ path: 'user' }]);
    tutors.forEach((t: any) => (tutorsMap[String(t._id)] = t));
  }

  const revenueByTutor = byTutor.map((t: any) => ({ tutor: tutorsMap[String(t._id)] || t._id, totalRevenue: t.totalRevenue }));
  const revenueByDate = byDate.map((d: any) => ({ date: d._id, revenue: d.revenue || 0, paidRevenue: d.paidRevenue || 0 }));
  const monthlyRevenue = monthly.map((m: any) => ({ month: m._id, revenue: m.revenue || 0 }));

  // average revenue per class
  const classCount = await FinalClass.countDocuments(buildDateMatch('convertedAt', fromDate, toDate));
  const averageRevenuePerClass = classCount ? +(totals.totalRevenue / classCount).toFixed(2) : 0;

  return { ...totals, revenueByDate, revenueByTutor, monthlyRevenue, averageRevenuePerClass };
};

export const getOverallStatistics = async (fromDate?: Date, toDate?: Date) => {
  const [leadCountsAgg, finalCountsAgg, verifiedTutors, paymentAgg, activeClasses, pendingApprovals] = await Promise.all([
    ClassLead.aggregate([
      { $match: buildDateMatch('createdAt', fromDate, toDate) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    FinalClass.aggregate([
      { $match: buildDateMatch('convertedAt', fromDate, toDate) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Tutor.countDocuments({ verificationStatus: 'VERIFIED' as any }),
    Payment.aggregate([
      { $match: buildDateMatch('createdAt', fromDate, toDate) },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    FinalClass.countDocuments({ status: FINAL_CLASS_STATUS.ACTIVE as any }),
    getPendingApprovals(),
  ]);

  const leads: any = { total: 0, new: 0, converted: 0 };
  leadCountsAgg.forEach((l: any) => {
    leads.total += l.count || 0;
    if (l._id === CLASS_LEAD_STATUS.NEW) leads.new = l.count || 0;
    if (l._id === CLASS_LEAD_STATUS.CONVERTED) leads.converted = l.count || 0;
  });

  const finalClasses: any = { total: 0, active: 0, completed: 0 };
  finalCountsAgg.forEach((f: any) => {
    finalClasses.total += f.count || 0;
    if (f._id === FINAL_CLASS_STATUS.ACTIVE) finalClasses.active = f.count || 0;
    if (f._id === FINAL_CLASS_STATUS.COMPLETED) finalClasses.completed = f.count || 0;
  });

  const payments: any = { total: 0, totalRevenue: 0, paidRevenue: 0, pendingRevenue: 0, feesCollected: 0, tutorPayout: 0 };
  paymentAgg.forEach((p: any) => {
    payments.total += p.count || 0;
    payments.totalRevenue += p.amount || 0;
    if (p._id === PAYMENT_STATUS.PAID) payments.paidRevenue = p.amount || 0;
    if (p._id === PAYMENT_STATUS.PENDING) payments.pendingRevenue = p.amount || 0;
  });

  // Split by paymentType
  const typeAgg = await Payment.aggregate([
    { $match: buildDateMatch('createdAt', fromDate, toDate) },
    { $group: { _id: '$paymentType', amount: { $sum: '$amount' } } },
  ]);
  typeAgg.forEach((t: any) => {
    if (t._id === 'FEES_COLLECTED') payments.feesCollected = +(t.amount || 0).toFixed(2);
    if (t._id === 'TUTOR_PAYOUT') payments.tutorPayout = +(t.amount || 0).toFixed(2);
  });

  const conversionRate = leads.total ? +(100 * (leads.converted || 0) / leads.total).toFixed(2) : 0;
  const averageRevenuePerClass = finalClasses.total ? +(payments.totalRevenue / finalClasses.total).toFixed(2) : 0;

  return {
    classLeads: leads,
    finalClasses,
    tutors: { total: await Tutor.countDocuments({}), verified: verifiedTutors, active: activeClasses },
    payments,
    conversionRate,
    averageRevenuePerClass,
    pendingApprovals: pendingApprovals.totalPending,
  };
};

export const exportDashboardReport = async (
  reportType: 'leads' | 'classes' | 'tutors' | 'revenue' | 'comprehensive',
  filters: { fromDate?: Date; toDate?: Date }
): Promise<any[]> => {
  const { fromDate, toDate } = filters || {};
  if (reportType === 'leads') {
    const leads = await ClassLead.find(buildDateMatch('createdAt', fromDate, toDate)).populate([
      { path: 'assignedTutor' },
      { path: 'createdBy' },
    ]);
    return leads.map((l: any) => ({
      id: String(l._id),
      studentName: l.studentName,
      grade: l.grade,
      subject: (l.subject || []).join(','),
      status: l.status,
      assignedTutor: (l.assignedTutor as any)?.name || '',
      createdBy: (l.createdBy as any)?.name || '',
      createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : '',
    }));
  }
  if (reportType === 'classes') {
    const classes = await FinalClass.find(buildDateMatch('convertedAt', fromDate, toDate)).populate([
      { path: 'tutor' },
      { path: 'coordinator' },
      { path: 'convertedBy' },
    ]);
    return classes.map((c: any) => ({
      id: String(c._id),
      studentName: c.studentName,
      grade: c.grade,
      subject: (c.subject || []).join(','),
      status: c.status,
      tutor: (c.tutor as any)?.name || '',
      coordinator: (c.coordinator as any)?.name || '',
      convertedBy: (c.convertedBy as any)?.name || '',
      convertedAt: c.convertedAt ? new Date(c.convertedAt).toISOString() : '',
    }));
  }
  if (reportType === 'tutors') {
    const tutors = await Tutor.find({}).populate([{ path: 'user' }]);
    return tutors.map((t: any) => ({
      id: String(t._id),
      name: t.user?.name || '',
      email: t.user?.email || '',
      experienceHours: t.experienceHours || 0,
      ratings: t.ratings || 0,
      classesAssigned: t.classesAssigned || 0,
      classesCompleted: t.classesCompleted || 0,
      demosTaken: t.demosTaken || 0,
      demosApproved: t.demosApproved || 0,
      approvalRatio: t.approvalRatio || 0,
      verificationStatus: t.verificationStatus || '',
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : '',
    }));
  }
  if (reportType === 'revenue') {
    const payments = await Payment.find(buildDateMatch('createdAt', fromDate, toDate)).populate([
      { path: 'tutor' },
      { path: 'finalClass' },
    ]);
    return payments.map((p: any) => ({
      id: String(p._id),
      amount: p.amount,
      status: p.status,
      tutor: (p.tutor as any)?.name || '',
      classId: String((p.finalClass as any)?._id || ''),
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
    }));
  }
  // comprehensive
  const [leads, classes, tutors, payments]: [any[], any[], any[], any[]] = await Promise.all([
    exportDashboardReport('leads', { fromDate, toDate }),
    exportDashboardReport('classes', { fromDate, toDate }),
    exportDashboardReport('tutors', { fromDate, toDate }),
    exportDashboardReport('revenue', { fromDate, toDate }),
  ]);
  return [
    { section: 'LEADS' },
    ...leads,
    { section: 'CLASSES' },
    ...classes,
    { section: 'TUTORS' },
    ...tutors,
    { section: 'REVENUE' },
    ...payments,
  ];
};

export default {
  getDateWiseClassLeads,
  getClassLeadStatusDistribution,
  getConversionFunnel,
  getFinalClassProgress,
  getTutorProgressReport,
  getCumulativeClassGrowth,
  getPendingApprovals,
  getRevenueAnalytics,
  getOverallStatistics,
  exportDashboardReport,
};
