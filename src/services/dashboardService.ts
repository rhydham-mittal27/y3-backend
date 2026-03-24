import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import Tutor from '../models/Tutor';
import DemoHistory from '../models/DemoHistory';
import { ATTENDANCE_STATUS, CLASS_LEAD_STATUS, DEMO_STATUS, FINAL_CLASS_STATUS, PAYMENT_STATUS, PAYMENT_TYPE, USER_ROLES } from '../config/constants';

const buildMatch = (field: string, fromDate?: Date, toDate?: Date, additionalAPI?: any) => {
  const match: any = { ...additionalAPI };
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
  groupBy: 'day' | 'week' | 'month' = 'day',
  managerId?: string
) => {
  const match = buildMatch('createdAt', fromDate, toDate, managerId ? { createdBy: managerId } : {});
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

export const getClassLeadStatusDistribution = async (fromDate?: Date, toDate?: Date, managerId?: string) => {
  const match = buildMatch('createdAt', fromDate, toDate, managerId ? { createdBy: managerId } : {});
  const pipeline: any[] = [
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ];
  const agg = await ClassLead.aggregate(pipeline);
  const total = agg.reduce((s: number, a: any) => s + (a.count || 0), 0) || 1;
  return agg.map((a: any) => ({ status: a._id, count: a.count, percentage: +(100 * (a.count || 0) / total).toFixed(2) }));
};

export const getConversionFunnel = async (fromDate?: Date, toDate?: Date, managerId?: string) => {
  const match = buildMatch('createdAt', fromDate, toDate, managerId ? { createdBy: managerId } : {});
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

export const getFinalClassProgress = async (fromDate?: Date, toDate?: Date, managerId?: string) => {
  const match = buildMatch('convertedAt', fromDate, toDate, managerId ? { convertedBy: managerId } : {});
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
  toDate?: Date,
  managerId?: string
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
      if (managerId) classMatch.convertedBy = managerId;
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
  groupBy: 'day' | 'week' | 'month' = 'day',
  managerId?: string
) => {
  const fmt = groupFormat(groupBy);
  const createdMatch = buildMatch('convertedAt', fromDate, toDate, managerId ? { convertedBy: managerId } : {});
  const endedMatch = buildMatch('updatedAt', fromDate, toDate, managerId ? { convertedBy: managerId } : {});
  endedMatch.status = { $in: [FINAL_CLASS_STATUS.COMPLETED, FINAL_CLASS_STATUS.CANCELLED] };

  // 1. Calculate Baseline (Counts before fromDate)
  // We need this to correctly plot "Active Classes" starting point.
  const beforeMatchCreated: any = { convertedAt: { $lt: new Date(fromDate) }, ...(managerId ? { convertedBy: managerId } : {}) };
  const beforeMatchEnded: any = { 
    updatedAt: { $lt: new Date(fromDate) },
    status: { $in: [FINAL_CLASS_STATUS.COMPLETED, FINAL_CLASS_STATUS.CANCELLED] },
    ...(managerId ? { convertedBy: managerId } : {})
  };

  const [createdAgg, endedAgg, baselineCreated, baselineEnded] = await Promise.all([
    FinalClass.aggregate([
      { $match: createdMatch },
      { $group: { _id: { $dateToString: { format: fmt, date: '$convertedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    FinalClass.aggregate([
      { $match: endedMatch },
      { $group: { _id: { $dateToString: { format: fmt, date: '$updatedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    FinalClass.countDocuments(beforeMatchCreated),
    FinalClass.countDocuments(beforeMatchEnded)
  ]);

  // Merge dates
  const dates = new Set<string>();
  const createdMap: Record<string, number> = {};
  const endedMap: Record<string, number> = {};

  createdAgg.forEach((a: any) => {
    dates.add(a._id);
    createdMap[a._id] = a.count;
  });
  endedAgg.forEach((a: any) => {
    dates.add(a._id);
    endedMap[a._id] = a.count;
  });

  const sortedDates = Array.from(dates).sort();
  
  // Running tallies starting from baseline
  let runningTotalCreated = baselineCreated;
  let runningTotalEnded = baselineEnded;

  return sortedDates.map(date => {
    const dailyNew = createdMap[date] || 0;
    const dailyEnded = endedMap[date] || 0;

    runningTotalCreated += dailyNew;
    runningTotalEnded += dailyEnded;

    const activeH = runningTotalCreated - runningTotalEnded;

    return {
      date,
      totalClasses: dailyNew, // RENAMED CONCEPT: Now returns "New Classes" (Unique for day)
      activeClasses: activeH, // Snapshot: Active classes on this day
      inactiveClasses: dailyEnded, // RENAMED CONCEPT: Now returns "Ended Classes" (Unique for day)
      newClasses: dailyNew,
      cumulativeClasses: runningTotalCreated
    };
  });
};

export const getPendingApprovals = async (_managerId?: string) => {
  // managerId used for future filtering logic if needed. 
  // Currently returning global potential approvals or partially filtered if feasible.
  
  const [
    coordinatorPending,
    parentPending,
    scheduledDemos,
    pendingVerifications,
    pendingTierChanges,
  ] = await Promise.all([
    Attendance.countDocuments({ status: ATTENDANCE_STATUS.PENDING as any }),
    Attendance.countDocuments({ status: ATTENDANCE_STATUS.COORDINATOR_APPROVED as any }),
    DemoHistory.countDocuments({ status: DEMO_STATUS.SCHEDULED as any }),
    Tutor.countDocuments({ verificationStatus: 'UNDER_REVIEW' as any }),
    Tutor.countDocuments({ pendingTierChange: { $exists: true, $ne: null } }),
  ]);

  const attendance = {
    coordinatorPending,
    parentPending,
    total: coordinatorPending + parentPending,
  };
  const demos = { scheduledCount: scheduledDemos };
  const totalPending = attendance.total + demos.scheduledCount + pendingVerifications + pendingTierChanges;

  return {
    attendance,
    demos,
    verifications: pendingVerifications,
    tierChanges: pendingTierChanges,
    totalPending,
  };
};

export const getRevenueAnalytics = async (
  fromDate?: Date,
  toDate?: Date,
  groupBy: 'day' | 'week' | 'month' = 'month',
  managerId?: string
) => {
  const match = buildMatch('createdAt', fromDate, toDate, managerId ? { 
    // Revenue (Payment) -> FinalClass (convertedBy) matched?
    // Payment schema has `finalClass` ref.
    // We would need lookup to filter by FinalClass.convertedBy.
    // This aggregate does not have lookup yet at top level.
    // BUT Payment has `tutor`.
    // We can't easily filter by manager without lookup.
    // Let's add lookup strictly for manager filtering if needed.
  } : {});
  
  // NOTE: To filter payments by manager (who converted the class), we need a lookup.
  const pipelinePrepend: any[] = [];
  if (managerId) {
    pipelinePrepend.push(
      { $lookup: { from: 'finalclasses', localField: 'finalClass', foreignField: '_id', as: 'fc' } },
      { $unwind: { path: '$fc', preserveNullAndEmptyArrays: true } }, // Some payments (like registration) might not have class?
      // Actually strictly payments for classes.
      { $match: { 'fc.convertedBy': new mongoose.Types.ObjectId(managerId) } }
    );
  }

  const fmt = groupFormat(groupBy);
  const [statusAgg, byDate, byTutor, monthly] = await Promise.all([
    Payment.aggregate([
      ...pipelinePrepend,
      { $match: match },
      {
        $group: {
          _id: '$status',
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Payment.aggregate([
      ...pipelinePrepend,
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: '$paymentDate' } }, // Use paymentDate for accuracy, fallback to createdAt if needed
          feesCollected: { 
            $sum: { 
              $cond: [
                { $and: [
                   { $eq: ['$status', PAYMENT_STATUS.PAID] }, 
                   { $ne: ['$paymentType', PAYMENT_TYPE.TUTOR_PAYOUT] } // Default or explicit Fees
                ]}, 
                '$amount', 
                0
              ] 
            } 
          },
          tutorPayout: { 
            $sum: { 
              $cond: [
                { $and: [
                   { $eq: ['$status', PAYMENT_STATUS.PAID] }, 
                   { $eq: ['$paymentType', PAYMENT_TYPE.TUTOR_PAYOUT] }
                ]}, 
                '$amount', 
                0
              ] 
            } 
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      ...pipelinePrepend,
      { $match: match },
      { $group: { _id: '$tutor', totalRevenue: { $sum: '$amount' } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]),
    Payment.aggregate([
      ...pipelinePrepend,
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
  
  const revenueTrends = byDate.map((d: any) => ({
    date: d._id || 'Unknown',
    feesCollected: d.feesCollected || 0,
    tutorPayout: d.tutorPayout || 0,
    serviceCharge: (d.feesCollected || 0) - (d.tutorPayout || 0)
  }));

  const monthlyRevenue = monthly.map((m: any) => ({ month: m._id, revenue: m.revenue || 0 }));

  // average revenue per class
  const classCount = await FinalClass.countDocuments(buildMatch('convertedAt', fromDate, toDate, managerId ? { convertedBy: managerId } : {}));
  const averageRevenuePerClass = classCount ? +(totals.totalRevenue / classCount).toFixed(2) : 0;

  return { ...totals, revenueTrends, revenueByTutor, monthlyRevenue, averageRevenuePerClass };
};

export const getOverallStatistics = async (fromDate?: Date, toDate?: Date, city?: string, managerId?: string) => {
  // Use user-provided date range for Revenue if available, otherwise default to current month for "Monthly Revenue" card context?
  // User requested "from date to to date" filter.
  // The "Monthly Revenue" card specifically says "Current Month".
  // The "Gross Revenue" card says "All time".
  // If a date range is applied:
  // - "Monthly Revenue" card could stick to being "Current Month" (KPI definition)
  // - "Gross Revenue" card should probably become "Revenue in Range".
  // However, for Simplicity and Consistency with the user's request "from date to to date", 
  // we will apply the date range filters to the "Gross/Total" metrics.
  
  const dateMatchLead = buildMatch('createdAt', fromDate, toDate, managerId ? { createdBy: managerId } : {});
  const dateMatchPayment = buildMatch('paymentDate', fromDate, toDate); // Payment filtering needs lookup below 

  // City Filter Match
  // ClassLead has 'city'. FinalClass and Payment need lookup.
  const cityMatchLead = city ? { city: { $regex: city, $options: 'i' } } : {};
  
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // 1. Total Teachers (Snapshot) - If city is present, filter by preferredCities
  const teacherQuery: any = {};
  if (city) {
    teacherQuery.preferredCities = { $regex: city, $options: 'i' };
  }

  // 2. Class Leads (Aggregated)
  const leadsCount = await ClassLead.countDocuments({ ...dateMatchLead, ...cityMatchLead });

  // 3. Active Classes (Snapshot or Range?) - "Active" status implies current. 
  // If city is needed, we must look up.
  // We'll count Active classes that match the city. 
  const activeClassPipeline: any[] = [
    { $match: { 
        status: FINAL_CLASS_STATUS.ACTIVE,
        ...(managerId ? { convertedBy: new mongoose.Types.ObjectId(managerId) } : {}) 
      } 
    },
    {
      $lookup: {
        from: 'classleads',
        localField: 'classLead',
        foreignField: '_id',
        as: 'leadDoc'
      }
    },
    { $unwind: '$leadDoc' }
  ];
  if (city) {
    activeClassPipeline.push({ $match: { 'leadDoc.city': { $regex: city, $options: 'i' } } });
  }
  // No date match for "Active Classes" typically, as it's a current status. 
  // If the user wants "Classes created in this date range", that's different. 
  // Let's explicitly ignore date range for "Active Classes" count to show CURRENT active load, 
  // UNLESS the user implies "System State at that time" which is hard.
  // We will keep "Active Classes" as CURRENT active classes filtered by City.
  
  // 4. Monthly Revenue (Current Month, ignoring date range filter for this specific card usually, but filtering by city)
  const monthlyRevenuePipeline: any[] = [
    { $match: { status: PAYMENT_STATUS.PAID, paymentDate: { $gte: startOfMonth } } },
    {
      $lookup: {
        from: 'finalclasses',
        localField: 'finalClass',
        foreignField: '_id',
        as: 'fc'
      }
    },
    { $unwind: '$fc' },
    {
      $lookup: {
        from: 'classleads',
        localField: 'fc.classLead',
        foreignField: '_id',
        as: 'lead'
      }
    },
    { $unwind: '$lead' }
  ];
  if (city) {
    monthlyRevenuePipeline.push({ $match: { 'lead.city': { $regex: city, $options: 'i' } } });
  }
  monthlyRevenuePipeline.push({ $group: { _id: null, total: { $sum: '$amount' } } });


  // 5. Gross (or Period) Revenue
  // Applies both Date Range (if provided) and City
  const grossRevenuePipeline: any[] = [
    { $match: { status: PAYMENT_STATUS.PAID, ...dateMatchPayment } },
    {
      $lookup: {
        from: 'finalclasses',
        localField: 'finalClass',
        foreignField: '_id',
        as: 'fc'
      }
    },
    { $unwind: '$fc' },
    {
      $lookup: {
        from: 'classleads',
        localField: 'fc.classLead',
        foreignField: '_id',
        as: 'lead'
      }
    },
    { $unwind: '$lead' }
  ];
  if (city) {
    grossRevenuePipeline.push({ $match: { 'lead.city': { $regex: city, $options: 'i' } } });
  }
  grossRevenuePipeline.push({ $group: { _id: null, total: { $sum: '$amount' } } });

  // 6. Churn Rate (Monthly/Period)
  // Churn = (Cancelled in Period) / (Active at Start + New in Period) * 100
  const churnStart = fromDate || startOfMonth;
  const churnEnd = toDate || new Date();

  // Refined Pipeline Builder
  const buildPipeline = (initialMatch: any) => {
    const p: any[] = [{ $match: initialMatch }];
    if (city) {
      p.push(
        { $lookup: { from: 'classleads', localField: 'classLead', foreignField: '_id', as: 'lead' } },
        { $unwind: '$lead' },
        { $match: { 'lead.city': { $regex: city, $options: 'i' } } }
      );
    }
    if (managerId) {
      // Must check if we are querying FinalClass (default)
      // Yes, this builder is used for FinalClass aggregates below
      p.push({ $match: { convertedBy: new mongoose.Types.ObjectId(managerId) } });
    }
    p.push({ $count: "count" });
    return p;
  };

  const pCancelled = buildPipeline({
    status: FINAL_CLASS_STATUS.CANCELLED,
    updatedAt: { $gte: churnStart, $lte: churnEnd }
  });
  
  const pNew = buildPipeline({
    convertedAt: { $gte: churnStart, $lte: churnEnd }
  });

  const pActiveStart = buildPipeline({
    convertedAt: { $lt: churnStart },
    $or: [
        { status: FINAL_CLASS_STATUS.ACTIVE },
        { updatedAt: { $gte: churnStart } }
    ]
  });

  const [
    totalTeachers,
    verifiedTeachers,
    // activeTeachersIds, // Hard to filter by city efficiently without complex active class lookup.
    // Let's approx active teachers as those with verified status and active flag for now if city is present, 
    // OR do the heavy active class lookup if needed.
    // Let's do the active class lookup to be accurate.
    activeClassResults,
    monthlyRevResults,
    grossRevResults,
    pendingApprovals,
    cancelledRes,
    newRes,
    activeStartRes
  ] = await Promise.all([
    Tutor.countDocuments(teacherQuery),
    Tutor.countDocuments({ ...teacherQuery, verificationStatus: 'VERIFIED' }),
    FinalClass.aggregate(activeClassPipeline), // This gives us active classes.
    Payment.aggregate(monthlyRevenuePipeline),
    Payment.aggregate(grossRevenuePipeline),
    getPendingApprovals(),
    FinalClass.aggregate(pCancelled),
    FinalClass.aggregate(pNew),
    FinalClass.aggregate(pActiveStart)
  ]);

  const activeClassesCount = activeClassResults.length;
  // Active Teachers = Unique Tutors from the Active Classes result
  const uniqueActiveTutors = new Set(activeClassResults.map((c: any) => String(c.tutor)));
  const activeTeachers = uniqueActiveTutors.size;

  const monthlyRevenue = monthlyRevResults[0]?.total || 0;
  const grossRevenue = grossRevResults[0]?.total || 0;

  const cancelledCount = cancelledRes[0]?.count || 0;
  const newCount = newRes[0]?.count || 0;
  const activeStartCount = activeStartRes[0]?.count || 0;
  const denominator = activeStartCount + newCount;
  const studentChurnRate = denominator > 0 ? +((cancelledCount / denominator) * 100).toFixed(2) : 0;

  // 7. Teacher Churn Rate
  // Teacher Churn = (Became Inactive in Period) / (Active at Start + New in Period) * 100
  // We need to look up User status.
  const buildTeacherPipeline = (matchConditions: any) => {
     const p: any[] = [
       { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
       { $unwind: '$u' },
       { $match: matchConditions } // Conditions on 'u' or 'Tutor' fields
     ];
     // Add City Filter (on Tutor preferredCities usually, or ClassLead association?)
     // Earlier for 'totalTeachers' we filtered by `preferredCities`.
     if (city) {
        p.push({ $match: { preferredCities: { $regex: city, $options: 'i' } } });
     }
     p.push({ $count: "count" });
     return p;
  };

  const pTeacherChurned = buildTeacherPipeline({
    'u.role': USER_ROLES.TUTOR,
    'u.isActive': false,
    'u.updatedAt': { $gte: churnStart, $lte: churnEnd }
  });

  const pTeacherNew = buildTeacherPipeline({
    'u.role': USER_ROLES.TUTOR,
    'u.createdAt': { $gte: churnStart, $lte: churnEnd }
  });

  const pTeacherActiveStart = buildTeacherPipeline({
    'u.role': USER_ROLES.TUTOR,
    'u.createdAt': { $lt: churnStart },
    $or: [
        { 'u.isActive': true },
        { 'u.updatedAt': { $gte: churnStart } }
    ]
  });

  const [tChurnRes, tNewRes, tActiveStartRes] = await Promise.all([
    Tutor.aggregate(pTeacherChurned),
    Tutor.aggregate(pTeacherNew),
    Tutor.aggregate(pTeacherActiveStart)
  ]);

  const teacherChurnCount = tChurnRes[0]?.count || 0;
  const teacherNewCount = tNewRes[0]?.count || 0;
  const teacherActiveStartCount = tActiveStartRes[0]?.count || 0;
  const teacherDenominator = teacherActiveStartCount + teacherNewCount;
  const teacherChurnRate = teacherDenominator > 0 ? +((teacherChurnCount / teacherDenominator) * 100).toFixed(2) : 0;



    // 9. Today's Tasks Metrics
  const [
    websiteLeadsCount,
    coordinatorNotAssignedCount,
    pendingTutorVerificationCount,
    leadsNotClosedCount
  ] = await Promise.all([
    ClassLead.countDocuments({ 
      leadSource: 'WEBSITE', 
      status: CLASS_LEAD_STATUS.NEW,
      ...(managerId ? { createdBy: managerId } : {})
    }),
    FinalClass.countDocuments({ 
      status: FINAL_CLASS_STATUS.ACTIVE, 
      coordinator: null,
      ...(managerId ? { convertedBy: managerId } : {})
    }),
    Tutor.countDocuments({ verificationStatus: { $in: ['PENDING', 'UNDER_REVIEW'] } }), // Global Tutors
    ClassLead.countDocuments({ 
      status: { $nin: [CLASS_LEAD_STATUS.CONVERTED, CLASS_LEAD_STATUS.REJECTED, 'LOST'] },
      ...(managerId ? { createdBy: managerId } : {})
    })
  ]);

  // CRM KPI Metrics
  const crmGroups = await require('./leadService').getCRMLeadsGrouped(managerId ? [managerId] : undefined);
  const crmCounts = {
    new: crmGroups.new.length,
    announced: crmGroups.announced.length,
    interested: crmGroups.interested.length,
    demoScheduled: crmGroups.demoScheduled.length,
    demoPending: crmGroups.demoPending.length,
    won: crmGroups.won.length,
  };

  return {
    kpi: {
      totalTeachers,
      verifiedTeachers,
      activeTeachers,
      totalClassLeads: leadsCount,
      activeClasses: activeClassesCount,
      monthlyRevenue,
      grossRevenue,
      studentChurn: studentChurnRate,
      teacherChurn: teacherChurnRate,

    },
    todaysTasks: {
      websiteLeadsCount,
      coordinatorNotAssignedCount,
      pendingTutorVerificationCount,
      leadsNotClosedCount,
      coordinatorRequestsCount: 0 // Placeholder
    },
    crmCounts,
    // Legacy mapping (dummy values where calculations are skipped for perf)
    classLeads: { total: leadsCount, new: 0, converted: 0 }, 
    finalClasses: { total: 0, active: activeClassesCount, completed: 0 },
    tutors: { total: totalTeachers, verified: verifiedTeachers, active: activeTeachers },
    payments: { total: 0, totalRevenue: grossRevenue, paidRevenue: grossRevenue, pendingRevenue: 0, feesCollected: 0, tutorPayout: 0 },
    conversionRate: 0,
    averageRevenuePerClass: 0,
    pendingApprovals: pendingApprovals.totalPending,
  };
};

export const exportDashboardReport = async (
  reportType: 'leads' | 'classes' | 'tutors' | 'revenue' | 'comprehensive',
  filters: { fromDate?: Date; toDate?: Date },
  managerId?: string
): Promise<any[]> => {
  const { fromDate, toDate } = filters || {};
  if (reportType === 'leads') {
    const leads = await ClassLead.find(buildMatch('createdAt', fromDate, toDate, managerId ? { createdBy: managerId } : {})).populate([
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
    const classes = await FinalClass.find(buildMatch('convertedAt', fromDate, toDate, managerId ? { convertedBy: managerId } : {})).populate([
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
    // Need lookup to filter by manager? Or just fetch all and filter in JS if complex?
    // Payment.find doesn't support pipeline.
    // We can filter by `finalClass` if we first find all finalClasses by this manager.
    let paymentMatch: any = buildMatch('createdAt', fromDate, toDate);
    if (managerId) {
       const managerClasses = await FinalClass.find({ convertedBy: managerId }).select('_id');
       const classIds = managerClasses.map(c => c._id);
       paymentMatch.finalClass = { $in: classIds };
    }
    const payments = await Payment.find(paymentMatch).populate([
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
    exportDashboardReport('leads', { fromDate, toDate }, managerId),
    exportDashboardReport('classes', { fromDate, toDate }, managerId),
    exportDashboardReport('tutors', { fromDate, toDate }, managerId),
    exportDashboardReport('revenue', { fromDate, toDate }, managerId),
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
