import User from '../models/User';
import Parent from '../models/Parent';
import ParentLead from '../models/ParentLead';
import ErrorResponse from '../utils/errorResponse';
import { USER_ROLES } from '../config/constants';

interface RegisterParentInput {
  name: string;
  email: string;
  password: string;
  phone: string;
  userType?: 'PARENT' | 'STUDENT';
  city?: string;
  primaryStudentName?: string;
  primaryStudentGrade?: string;
  notes?: string;
  source?: string;
}

export const registerParentUser = async (input: RegisterParentInput) => {
  const { name, email, password, phone, userType = 'PARENT', city, primaryStudentName, primaryStudentGrade, notes, source = 'MOBILE_APP' } = input;

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new ErrorResponse('An account with this email already exists', 409);
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    city,
    role: USER_ROLES.PARENT,
    userType,
    isActive: true,
    acceptedTerms: true,
  });

  const parent = await Parent.create({
    user: user._id,
    primaryStudentName,
    primaryStudentGrade,
    notes,
    source,
  });

  // If a ParentLead with this email exists, link it
  await ParentLead.findOneAndUpdate(
    { parentEmail: email.toLowerCase().trim() },
    { user: user._id, status: 'ENROLLED' }
  );

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    parent: {
      id: parent._id,
      primaryStudentName: parent.primaryStudentName,
      primaryStudentGrade: parent.primaryStudentGrade,
    },
    accessToken,
    refreshToken,
  };
};

export const getParentProfile = async (userId: string) => {
  const parent = await Parent.findOne({ user: userId })
    .populate('user', 'name email phone city role isActive createdAt')
    .populate('children');

  if (!parent) {
    throw new ErrorResponse('Parent profile not found', 404);
  }

  return parent;
};

// ─── Parent Dashboard ─────────────────────────────────────────────────────────

import FinalClass from '../models/FinalClass';
import ShiftRequest from '../models/ShiftRequest';
import ClassSession from '../models/ClassSession';
import Attendance from '../models/Attendance';
import Test from '../models/Test';
import Tutor from '../models/Tutor';
import Notification from '../models/Notification';
import ClassLead from '../models/ClassLead';
import TeacherRequest from '../models/TeacherRequest';
import { CLASS_LEAD_STATUS } from '../config/constants';

/** Maps a TeacherRequest status → parent-facing stage */
const teacherRequestStage = (status: string): string | null => {
  const map: Record<string, string> = {
    NEW:            'REQUEST_RECEIVED',
    CONTACTED:      'LEAD_CREATED',
    DEMO_SCHEDULED: 'DEMO_SCHEDULED',
    DEMO_COMPLETED: 'AWAITING_APPROVAL',
    CONVERTED:      'AWAITING_APPROVAL',
  };
  return map[status] ?? null;
};

/** Maps a ClassLead status → parent-facing stage (fallback) */
const classLeadStage = (status: string): string | null => {
  const map: Record<string, string> = {
    NEW:                       'REQUEST_RECEIVED',
    ENQUIRY:                   'REQUEST_RECEIVED',
    ANNOUNCED:                 'LEAD_CREATED',
    DEMO_SCHEDULED:            'DEMO_SCHEDULED',
    DEMO_COMPLETED:            'AWAITING_APPROVAL',
    DEMO_APPROVED_BY_PARENT:   'AWAITING_APPROVAL',
    PAYMENT_RECEIVED:          'AWAITING_APPROVAL',
    TEACHER_ASSIGNED_FOR_DEMO: 'TEACHER_ASSIGNED_FOR_DEMO',
  };
  return map[status] ?? null;
};

export const getParentDashboardData = async (userId: string) => {
  const user = await User.findById(userId).select('name email');
  if (!user) throw new ErrorResponse('User not found', 404);

  // ── 1. Active class ────────────────────────────────────────────────────────
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' })
    .populate('tutor', 'name email phone')
    .populate('subject', 'label value');

  if (!activeClass) {
    let pendingRequest = null;

    // Priority 1: TeacherRequest submitted by this parent
    const teacherReq = await TeacherRequest.findOne({
      parent: userId,
      status: { $nin: ['CONVERTED', 'CLOSED'] },
    })
      .sort({ createdAt: -1 })
      .populate('board',    'label')
      .populate('grade',    'label')
      .populate('subjects', 'label')
      .select('status board grade subjects studentName createdAt');

    if (teacherReq) {
      const stage = teacherRequestStage(teacherReq.status as string);
      if (stage) {
        const subjectLabels = (teacherReq.subjects as any[]).map((s) => s.label).join(', ');
        pendingRequest = {
          _id:       teacherReq._id,
          stage,
          subject:   subjectLabels || undefined,
          grade:     (teacherReq.grade as any)?.label ?? undefined,
          createdAt: teacherReq.createdAt,
        };
      }
    }

    // Priority 2: ClassLead matched by parent email (manager-created lead)
    if (!pendingRequest) {
      const classLead = await ClassLead.findOne({
        parentEmail: user.email,
        status: { $nin: [CLASS_LEAD_STATUS.CONVERTED, CLASS_LEAD_STATUS.REJECTED] },
      })
        .sort({ createdAt: -1 })
        .select('status subject grade createdAt');

      if (classLead) {
        const stage = classLeadStage(classLead.status as string);
        if (stage) {
          pendingRequest = {
            _id:       classLead._id,
            stage,
            subject:   (classLead.subject as any[])?.[0]?.label ?? undefined,
            grade:     classLead.grade,
            createdAt: classLead.createdAt,
          };
        }
      }
    }

    return {
      hasActiveClass: false,
      parentName: user.name,
      pendingRequest,
    };
  }

  // ── 2. Upcoming sessions ───────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcomingSessions = await ClassSession.find({
    finalClass: activeClass._id,
    sessionDate: { $gte: today },
    status: 'PLANNED',
  })
    .sort({ sessionDate: 1 })
    .limit(5)
    .select('sessionDate timeSlot sessionNumber status');

  const nextSession = upcomingSessions[0] ?? null;

  // ── 3. Attendance this month ───────────────────────────────────────────────
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const attendanceRecords = await Attendance.find({
    finalClass: activeClass._id,
    sessionDate: { $gte: monthStart },
  }).select('status studentAttendanceStatus');

  const totalSessionsThisMonth = attendanceRecords.length;
  const presentCount = attendanceRecords.filter(
    (a) => a.studentAttendanceStatus === 'PRESENT' || a.studentAttendanceStatus === 'LATE',
  ).length;
  const attendancePercentage =
    totalSessionsThisMonth > 0 ? Math.round((presentCount / totalSessionsThisMonth) * 100) : null;

  // ── 4. Latest test ────────────────────────────────────────────────────────
  const latestTest = await Test.findOne({
    finalClass: activeClass._id,
    status: 'COMPLETED',
    obtainedMarks: { $ne: null },
  })
    .sort({ testDate: -1 })
    .select('testDate topicName totalMarks obtainedMarks finalClass')
    .populate('finalClass', 'subject');

  // ── 5. Tutor rating ───────────────────────────────────────────────────────
  const tutorUser: any = activeClass.tutor as any;
  const tutorProfile = tutorUser?._id
    ? await Tutor.findOne({ user: tutorUser._id }).select('ratings')
    : null;

  // ── 6. Recent activity (notifications for this parent) ────────────────────
  const notifications = await Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('type title message createdAt');

  const recentActivity = notifications.map((n) => ({
    _id: n._id,
    type: (
      n.type === 'ATTENDANCE' ? 'ATTENDANCE' :
      n.type === 'PAYMENT'    ? 'GENERAL'    :
      'GENERAL'
    ),
    title: n.title,
    description: n.message,
    createdAt: n.createdAt,
  }));

  // ── 7. Build subject label ─────────────────────────────────────────────────
  const subjectLabel = (activeClass.subject as any[])
    .map((s: any) => s?.label ?? s?.value ?? String(s))
    .filter(Boolean)
    .join(', ');

  return {
    hasActiveClass: true,
    parentName: user.name,
    activeClass: {
      _id:            activeClass._id,
      studentName:    activeClass.studentName,
      subject:        subjectLabel,
      grade:          activeClass.grade,
      board:          activeClass.board,
      mode:           activeClass.mode,
      status:         activeClass.status,
      schedule:       activeClass.schedule,
      tutor: tutorUser
        ? {
            _id:      tutorUser._id,
            name:     tutorUser.name,
            email:    tutorUser.email,
            phone:    tutorUser.phone,
            rating:   tutorProfile?.ratings ?? null,
          }
        : null,
      attendanceThisMonth:    presentCount,
      totalSessionsThisMonth,
      attendancePercentage,
      completedSessions:      activeClass.completedSessions,
      classesPerMonth:        activeClass.classesPerMonth,
      nextSessionDate:        nextSession ? (nextSession.sessionDate as Date).toISOString() : null,
      nextSessionTime:        nextSession?.timeSlot ?? null,
    },
    upcomingSessions: upcomingSessions.map((s) => ({
      _id:           s._id,
      sessionDate:   (s.sessionDate as Date).toISOString(),
      timeSlot:      s.timeSlot,
      sessionNumber: s.sessionNumber,
      status:        s.status,
    })),
    latestTest: latestTest
      ? {
          _id:       latestTest._id,
          subject:   subjectLabel,
          score:     latestTest.obtainedMarks ?? 0,
          totalMarks:latestTest.totalMarks ?? 0,
          date:      (latestTest.testDate as Date).toISOString(),
        }
      : null,
    recentActivity,
  };
};

export const submitParentTutorRequest = async (
  userId: string,
  payload: { subject: string; grade: string; board?: string; mode?: string; city?: string; notes?: string },
) => {
  const user = await User.findById(userId).select('name email phone');
  if (!user) throw new ErrorResponse('User not found', 404);

  // Prevent duplicate open requests
  const existing = await ParentLead.findOne({ user: userId, status: { $in: ['NEW', 'CONTACTED'] } });
  if (existing) throw new ErrorResponse('You already have an open tutor request', 409);

  const noteText = [
    `Subject: ${payload.subject}`,
    payload.board  ? `Board: ${payload.board}`  : null,
    payload.mode   ? `Mode: ${payload.mode}`    : null,
    payload.city   ? `City: ${payload.city}`    : null,
    payload.notes  ? payload.notes              : null,
  ].filter(Boolean).join(' | ');

  const lead = await ParentLead.create({
    parentName:   user.name,
    parentEmail:  user.email,
    parentPhone:  user.phone || '',
    studentName:  user.name,   // placeholder — manager will update
    studentGrade: payload.grade,
    city:         payload.city,
    notes:        noteText,
    source:       'MOBILE_APP',
    status:       'NEW',
    user:         userId,
  });

  return {
    _id:       lead._id,
    stage:     'REQUEST_RECEIVED',
    subject:   payload.subject,
    grade:     payload.grade,
    createdAt: lead.createdAt,
  };
};

// ─── Parent Sessions (Classes tab) ────────────────────────────────────────────

import Payment from '../models/Payment';
import { ATTENDANCE_STATUS, PAYMENT_STATUS, PAYMENT_TYPE } from '../config/constants';

/** Returns date as IST YYYY-MM-DD, avoiding UTC-shift timezone bugs */
const toLocalDateString = (d: Date): string => {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

export const getParentSessionsData = async (userId: string, month?: string) => {
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' });
  if (!activeClass) throw new ErrorResponse('No active class found', 404);

  let year: number, mon: number;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    year = y; mon = m;
  } else {
    const now = new Date();
    year = now.getFullYear(); mon = now.getMonth() + 1;
  }

  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd   = new Date(year, mon, 1);

  const [sessions, attendanceRecords] = await Promise.all([
    ClassSession.find({
      finalClass: activeClass._id,
      sessionDate: { $gte: monthStart, $lt: monthEnd },
    }).sort({ sessionDate: 1 }).select('sessionDate timeSlot sessionNumber status'),

    Attendance.find({
      finalClass: activeClass._id,
      sessionDate: { $gte: monthStart, $lt: monthEnd },
    }).select('sessionDate status studentAttendanceStatus topicCovered notes parentApprovedBy parentApprovedAt swotAnalysis resources'),
  ]);

  // Index attendance by date string for O(1) lookup
  const attByDate = new Map<string, typeof attendanceRecords[0]>();
  for (const a of attendanceRecords) {
    attByDate.set(toLocalDateString(a.sessionDate as Date), a);
  }

  const presentCount = attendanceRecords.filter(
    (a) => a.studentAttendanceStatus === 'PRESENT' || a.studentAttendanceStatus === 'LATE',
  ).length;
  const totalDone = attendanceRecords.length;

  const mappedSessions = sessions.map((s) => {
    const dateKey = toLocalDateString(s.sessionDate as Date);
    const att = attByDate.get(dateKey);
    const parentVerified = att ? !!(att.parentApprovedBy) : false;
    const attStatus: 'PENDING' | 'VERIFIED' | 'ABSENT' | 'PLANNED' = att
      ? (parentVerified ? 'VERIFIED' : att.studentAttendanceStatus === 'ABSENT' ? 'ABSENT' : 'PENDING')
      : (s.status === 'PLANNED' ? 'PLANNED' : 'PENDING');

    return {
      _id:             s._id,
      sessionDate:     toLocalDateString(s.sessionDate as Date),
      timeSlot:        s.timeSlot,
      sessionNumber:   s.sessionNumber,
      status:          s.status === 'PLANNED' ? 'SCHEDULED' : s.status,
      attendanceStatus: attStatus,
      attendanceId:    att?._id ?? null,
      topicsCovered:   att?.topicCovered ? [att.topicCovered] : [],
      tutorNote:       att?.notes ?? null,
      resources:       att?.resources ?? [],
      swot:            att?.swotAnalysis ?? null,
      parentVerified,
      parentVerifiedAt: att?.parentApprovedAt?.toISOString() ?? null,
    };
  });

  return {
    month: `${year}-${String(mon).padStart(2, '0')}`,
    classId: activeClass._id,
    studentName: activeClass.studentName,
    attendancePercentage: totalDone > 0 ? Math.round((presentCount / totalDone) * 100) : null,
    presentCount,
    totalDone,
    sessions: mappedSessions,
  };
};

export const verifyParentAttendanceRecord = async (
  userId: string,
  attendanceId: string,
  verified: boolean,
) => {
  const att = await Attendance.findById(attendanceId);
  if (!att) throw new ErrorResponse('Attendance record not found', 404);

  // Ensure this attendance belongs to a class the parent owns
  const cls = await FinalClass.findOne({ _id: att.finalClass, parent: userId });
  if (!cls) throw new ErrorResponse('Not authorised', 403);

  if (att.parentApprovedBy) throw new ErrorResponse('Already verified', 409);

  if (verified) {
    att.parentApprovedBy = userId as any;
    att.parentApprovedAt = new Date();
    // Escalate status if coordinator already approved
    if (att.status === ATTENDANCE_STATUS.COORDINATOR_APPROVED) {
      att.status = ATTENDANCE_STATUS.APPROVED;
    } else {
      att.status = ATTENDANCE_STATUS.PARENT_APPROVED;
    }
  }
  await att.save();

  return { verified, attendanceId: att._id, status: att.status };
};

export const requestParentReschedule = async (
  userId: string,
  payload: { sessionId: string; requestedDate: string; requestedTime: string; reason?: string },
) => {
  const session = await ClassSession.findById(payload.sessionId);
  if (!session) throw new ErrorResponse('Session not found', 404);

  const cls = await FinalClass.findOne({ _id: session.finalClass, parent: userId });
  if (!cls) throw new ErrorResponse('Not authorised', 403);

  const parentUser = await User.findById(userId).select('name');

  const entry = {
    sessionId:   session._id,
    fromDate:    session.sessionDate as Date,
    toDate:      new Date(payload.requestedDate),
    timeSlot:    session.timeSlot ?? payload.requestedTime,
    status:      'PENDING' as const,
    requestedBy: userId,
    requestedAt: new Date(),
  };

  await FinalClass.findByIdAndUpdate(cls._id, {
    $push: { oneTimeReschedules: entry },
  });

  if (cls.coordinator) {
    await Notification.create({
      recipient: cls.coordinator,
      type:      'GENERAL',
      title:     `Reschedule Request — ${cls.studentName}`,
      message:   `${parentUser?.name ?? 'Parent'} requested to reschedule session on ${entry.fromDate.toDateString()} to ${entry.toDate.toDateString()}. ${payload.reason ?? ''}`.trim(),
    });
  }

  return { requested: true, fromDate: entry.fromDate, toDate: entry.toDate };
};

export const getParentRescheduleHistory = async (userId: string) => {
  const classes = await FinalClass.find({ parent: userId })
    .select('studentName className subject oneTimeReschedules')
    .populate('subject', 'label')
    .lean();

  const history: any[] = [];
  for (const cls of classes) {
    for (const r of (cls.oneTimeReschedules ?? [])) {
      history.push({
        requestId:   r._id,
        classId:     cls._id,
        studentName: cls.studentName,
        className:   cls.className,
        subject:     (cls.subject as any)?.label ?? cls.subject,
        fromDate:    r.fromDate,
        toDate:      r.toDate,
        timeSlot:    r.timeSlot,
        status:      r.status,
        requestedAt: r.requestedAt,
        rejectionReason: r.rejectionReason,
      });
    }
  }

  history.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  return history;
};

// ─── Parent Payments ──────────────────────────────────────────────────────────

export const getParentPaymentsData = async (userId: string) => {
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' }).populate('subject', 'label value');
  if (!activeClass) throw new ErrorResponse('No active class found', 404);

  const payments = await Payment.find({
    finalClass: activeClass._id,
    paymentType: PAYMENT_TYPE.FEES_COLLECTED,
  })
    .sort({ dueDate: -1 })
    .select('paymentId amount currency status paymentMethod paymentDate dueDate cycleMonth cycleYear notes transactionId');

  const nextPayment = payments.find(
    (p) => p.status === PAYMENT_STATUS.PENDING || p.status === PAYMENT_STATUS.OVERDUE,
  ) ?? null;

  const rawSubjects = (activeClass.subject as any[]) ?? [];
  const subjectLabel =
    rawSubjects
      .map((s: any) => s?.label ?? s?.value ?? null)
      .filter(Boolean)
      .join(', ') || (activeClass as any).className || 'Class Fee';

  // Value summary: classes done, subjects, fees paid
  const paidPayments = payments.filter((p) => p.status === PAYMENT_STATUS.PAID);
  const totalPaid    = paidPayments.reduce((sum, p) => sum + p.amount, 0);

  const monthLabel = (p: any) =>
    p.cycleMonth != null && p.cycleYear != null
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][p.cycleMonth - 1] ?? ''} ${p.cycleYear}`
      : subjectLabel;

  return {
    valueSummary: {
      classesCompleted: activeClass.completedSessions ?? 0,
      subjectsActive:   (activeClass.subject as any[]).length,
      amountSpent:      totalPaid,
    },
    nextPayment: nextPayment
      ? {
          _id:       nextPayment._id,
          paymentId: (nextPayment as any).paymentId ?? null,
          amount:    nextPayment.amount,
          status:    nextPayment.status,
          dueDate:   (nextPayment.dueDate as Date).toISOString(),
          month:     monthLabel(nextPayment),
        }
      : null,
    history: payments.map((p) => ({
      _id:          p._id,
      paymentId:    (p as any).paymentId ?? null,
      amount:       p.amount,
      status:       p.status,
      paymentDate:  p.paymentDate ? (p.paymentDate as Date).toISOString() : null,
      dueDate:      (p.dueDate as Date).toISOString(),
      month:        monthLabel(p),
    })),
  };
};

export const raiseParentConcern = async (
  userId: string,
  finalClassId: string,
  message: string,
) => {
  const cls = await FinalClass.findOne({ _id: finalClassId, parent: userId });
  if (!cls) throw new ErrorResponse('Class not found or not authorized', 404);

  // Delegate to the ticket system
  const { createTicket } = await import('./ticketService');
  const ticket = await createTicket(userId, {
    type:         'CONCERN',
    subject:      `Concern regarding ${cls.studentName}'s class`,
    description:  message,
    finalClassId: String(finalClassId),
  });

  return { raised: true, ticketNumber: ticket.ticketNumber };
};

// ─── Parent Progress ───────────────────────────────────────────────────────────

import { generateProgressInsight } from './aiService';
import { getPublicTutorProfile } from './tutorService';

export const getParentProgressData = async (userId: string) => {
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' })
    .populate('subject', 'label value')
    .select('studentName subject completedSessions currentCycleNumber');

  if (!activeClass) {
    return {
      studentName: '',
      overallTrend: 'STEADY' as const,
      trendSummary: 'No active class found.',
      subjects: [],
      allTests: [],
    };
  }

  const subjectLabel = (activeClass.subject as any[])
    .map((s: any) => s?.label ?? s?.value ?? String(s))
    .filter(Boolean)
    .join(', ');

  // All tests with results, sorted newest-first
  const tests = await Test.find({
    finalClass: activeClass._id,
    status: { $in: ['COMPLETED', 'REPORT_SUBMITTED'] },
    obtainedMarks: { $exists: true, $ne: null },
  })
    .sort({ testDate: -1 })
    .limit(20)
    .populate('coveredChapters', 'label')
    .select('testDate topicName totalMarks obtainedMarks topics tutorRemark testType cycleNumber status report coveredChapters');

  const allTests = tests.map((t: any) => ({
    _id:          String(t._id),
    subject:      subjectLabel,
    score:        t.obtainedMarks ?? 0,
    totalMarks:   t.totalMarks ?? 100,
    date:         (t.testDate as Date).toISOString(),
    type:         'TUTOR_SET' as const,
    topics:       t.topics ?? [],
    tutorRemark:  t.tutorRemark ?? undefined,
    testType:     t.testType ?? undefined,
    cycleNumber:  t.cycleNumber ?? undefined,
    topicName:    t.topicName ?? undefined,
    status:       t.status,
    coveredChapterLabels: ((t.coveredChapters ?? []) as any[]).map((c: any) => c.label ?? c).filter(Boolean),
    reportStrengths:          t.report?.strengths ?? undefined,
    reportAreasOfImprovement: t.report?.areasOfImprovement ?? undefined,
    reportRecommendations:    t.report?.recommendations ?? undefined,
  }));

  // Trend from last 3 tests
  const lastThree = allTests.slice(0, 3);
  let overallTrend: 'IMPROVING' | 'STEADY' | 'NEEDS_ATTENTION' = 'STEADY';
  let trendSummary = `${activeClass.studentName} is progressing steadily.`;
  if (lastThree.length >= 2) {
    const pctArr = lastThree.map((t) => (t.totalMarks > 0 ? t.score / t.totalMarks : 0));
    const delta = pctArr[0] - pctArr[pctArr.length - 1];
    if (delta > 0.05) {
      overallTrend = 'IMPROVING';
      trendSummary = `${activeClass.studentName} has improved ${Math.round(delta * 100)}% across recent tests.`;
    } else if (delta < -0.05) {
      overallTrend = 'NEEDS_ATTENTION';
      trendSummary = `${activeClass.studentName}'s scores have dipped recently. Your coordinator is keeping an eye on this.`;
    }
  } else if (!allTests.length) {
    trendSummary = 'No test data yet — results will appear here once your tutor starts recording scores.';
  }

  // Attendance rate
  const allAttendance = await Attendance.find({ finalClass: activeClass._id }).select('studentAttendanceStatus');
  const presentCount = allAttendance.filter((a: any) => a.studentAttendanceStatus === 'PRESENT' || a.studentAttendanceStatus === 'LATE').length;
  const attendanceRate = allAttendance.length > 0 ? Math.round((presentCount / allAttendance.length) * 100) : null;

  // Build subject data (single subject for now — one active class)
  const lastPct = allTests.length > 0 ? allTests[0].score / allTests[0].totalMarks : 0;
  const prevPct = allTests.length > 1 ? allTests[1].score / allTests[1].totalMarks : null;
  const subjTrend: 'UP' | 'DOWN' | 'STEADY' =
    prevPct === null ? 'STEADY' : lastPct > prevPct + 0.03 ? 'UP' : lastPct < prevPct - 0.03 ? 'DOWN' : 'STEADY';

  // Aggregate weak/strong topics from recent tests
  const topicScores: Record<string, number[]> = {};
  allTests.slice(0, 5).forEach((t) => {
    (t.topics ?? []).forEach((topic: string) => {
      if (!topicScores[topic]) topicScores[topic] = [];
      topicScores[topic].push(t.score / t.totalMarks);
    });
  });
  const strongTopics = Object.entries(topicScores).filter(([, v]) => v.reduce((a, b) => a + b, 0) / v.length >= 0.7).map(([k]) => k);
  const weakTopics = Object.entries(topicScores).filter(([, v]) => v.reduce((a, b) => a + b, 0) / v.length < 0.5).map(([k]) => k);

  // Syllabus coverage
  let syllabusData: { totalChapters: number; coveredChapters: number; chapterCoverage: Array<{ label: string; covered: boolean }> } = {
    totalChapters: 0, coveredChapters: 0, chapterCoverage: [],
  };
  try {
    const { getSyllabusCoverage } = await import('./testService');
    const coverage = await getSyllabusCoverage(String(activeClass._id));
    syllabusData = {
      totalChapters:   coverage.totalChapters,
      coveredChapters: coverage.coveredChapters,
      chapterCoverage: coverage.chapters.slice(0, 30).map((c) => ({ label: c.label, covered: c.covered })),
    };
  } catch (_) { /* non-fatal */ }

  const subjects = [{
    subject:         subjectLabel,
    lastScore:       allTests[0]?.score ?? 0,
    lastTotalMarks:  allTests[0]?.totalMarks ?? 100,
    trend:           subjTrend,
    strongTopics:    strongTopics.slice(0, 3),
    weakTopics:      weakTopics.slice(0, 3),
    lastRemark:      allTests[0]?.tutorRemark ?? undefined,
    tests:           allTests,
    ...syllabusData,
  }];

  // Generate AI insight (non-blocking — returns '' on failure or missing key)
  const aiInsight = await generateProgressInsight({
    studentName:  activeClass.studentName,
    subject:      subjectLabel,
    trend:        overallTrend,
    scores:       allTests.slice(0, 5).map((t) => ({ score: t.score, totalMarks: t.totalMarks, date: t.date })),
    attendanceRate: attendanceRate ?? undefined,
    strongTopics: strongTopics.slice(0, 3),
    weakTopics:   weakTopics.slice(0, 3),
    tutorRemark:  allTests[0]?.tutorRemark,
  });

  return {
    studentName:       activeClass.studentName,
    overallTrend,
    trendSummary,
    subjects,
    allTests,
    attendanceRate:    attendanceRate ?? undefined,
    completedSessions:  (activeClass as any).completedSessions ?? undefined,
    totalTestsTaken:    allTests.length,
    currentCycle:      (activeClass as any).currentCycleNumber ?? undefined,
    aiInsight:          aiInsight || undefined,
  };
};

// ─── Parent: View Their Tutor's Public Profile ────────────────────────────────

export const getParentTutorProfileData = async (userId: string) => {
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' })
    .populate('tutor', 'name')
    .select('tutor');

  if (!activeClass) throw new ErrorResponse('No active class found', 404);

  const tutorUser = activeClass.tutor as any;
  if (!tutorUser?._id) throw new ErrorResponse('No tutor assigned to your class yet', 404);

  const tutorProfile = await Tutor.findOne({ user: tutorUser._id }).select('teacherId');
  if (!tutorProfile?.teacherId) throw new ErrorResponse('Tutor profile not found', 404);

  return getPublicTutorProfile(tutorProfile.teacherId);
};

// ─── Child Profile ─────────────────────────────────────────────────────────────

export const getChildProfileData = async (userId: string) => {
  const [parent, user, activeClass] = await Promise.all([
    Parent.findOne({ user: userId }),
    User.findById(userId).select('name email phone city'),
    FinalClass.findOne({ parent: userId, status: 'ACTIVE' })
      .select('studentName grade board mode schedule notes')
      .populate('subject', 'label'),
  ]);

  if (!parent) throw new ErrorResponse('Parent profile not found', 404);

  return {
    // editable by parent
    primaryStudentName: parent.primaryStudentName ?? activeClass?.studentName ?? '',
    notes: parent.notes ?? '',
    // parent contact (editable)
    parentName: user?.name ?? '',
    parentEmail: user?.email ?? '',
    parentPhone: (user as any)?.phone ?? '',
    parentCity: (user as any)?.city ?? '',
    // locked — set by coordinator
    activeClass: activeClass
      ? {
          studentName: activeClass.studentName,
          grade: activeClass.grade,
          board: activeClass.board,
          mode: activeClass.mode,
          schedule: activeClass.schedule,
        }
      : null,
  };
};

export const updateChildProfileData = async (
  userId: string,
  payload: { primaryStudentName?: string; notes?: string }
) => {
  const parent = await Parent.findOne({ user: userId });
  if (!parent) throw new ErrorResponse('Parent profile not found', 404);

  if (payload.primaryStudentName !== undefined) parent.primaryStudentName = payload.primaryStudentName.trim();
  if (payload.notes !== undefined) parent.notes = payload.notes.trim();

  await parent.save();
  return { updated: true };
};


export const createParentShiftRequest = async (
  userId: string,
  payload: { effectiveDate: string; shiftDays: number; reason: string }
) => {
  const { effectiveDate, shiftDays, reason } = payload;

  if (!shiftDays || shiftDays < 1) throw new ErrorResponse('shiftDays must be at least 1', 400);

  if (!effectiveDate) throw new ErrorResponse('Effective date is required', 400);
  if (!reason?.trim()) throw new ErrorResponse('Reason is required', 400);

  const effDate = new Date(effectiveDate);
  if (isNaN(effDate.getTime())) throw new ErrorResponse('Invalid effective date', 400);
  if (effDate <= new Date()) throw new ErrorResponse('Effective date must be in the future', 400);

  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' });
  if (!activeClass) throw new ErrorResponse('No active class found', 404);

  const cycleNumber = (activeClass as any).currentCycleNumber ?? 1;

  const existing = await ShiftRequest.findOne({ finalClass: activeClass._id, cycleNumber, status: 'PENDING' });
  if (existing) throw new ErrorResponse('A pending shift request already exists for the current cycle', 409);

  const request = await ShiftRequest.create({
    finalClass:    activeClass._id,
    cycleNumber,
    requestedBy:   userId,
    effectiveDate: effDate,
    shiftDays,
    reason:        reason.trim(),
    status:        'PENDING',
  });

  if ((activeClass as any).coordinator) {
    const { createNotificationWithPreferences } = await import('./notificationService');
    try {
      await createNotificationWithPreferences({
        recipient: String((activeClass as any).coordinator),
        type: 'GENERAL',
        title: 'Parent Shift Request',
        message: `Parent has requested to shift cycle ${cycleNumber} sessions by ${shiftDays} day(s) starting from ${effDate.toDateString()}. Reason: ${reason.trim()}`,
      });
    } catch (_) { /* non-fatal */ }
  }

  return request;
};

export const requestTutorChange = async (userId: string, payload: { reason: string }) => {
  const { reason } = payload;
  if (!reason?.trim()) throw new ErrorResponse('Reason is required', 400);

  const parentUser = await User.findById(userId).select('name email phone');
  if (!parentUser) throw new ErrorResponse('User not found', 404);

  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' })
    .populate('coordinator', 'name email')
    .populate('subject', 'label')
    .select('studentName subject coordinator currentCycleNumber');
  if (!activeClass) throw new ErrorResponse('No active class found', 404);

  const coordinator = (activeClass as any).coordinator as { _id: any; name: string; email: string } | null;
  const subjectLabel = Array.isArray((activeClass as any).subject)
    ? (activeClass as any).subject.map((s: any) => s.label ?? s.value ?? s).join(', ')
    : ((activeClass as any).subject?.label ?? 'N/A');

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px">
      <h2 style="color:#1e293b;margin-bottom:4px">Tutor Change Request</h2>
      <p style="color:#64748b;font-size:13px;margin-top:0">Submitted by parent via the app</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
        <tr><td style="padding:8px 0;color:#64748b;width:140px">Parent</td><td style="color:#1e293b;font-weight:600">${parentUser.name}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Email</td><td style="color:#1e293b">${parentUser.email}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Phone</td><td style="color:#1e293b">${parentUser.phone ?? 'N/A'}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Student</td><td style="color:#1e293b;font-weight:600">${activeClass.studentName}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Subject</td><td style="color:#1e293b">${subjectLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Cycle</td><td style="color:#1e293b">${(activeClass as any).currentCycleNumber ?? 1}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Coordinator</td><td style="color:#1e293b">${coordinator?.name ?? 'Unassigned'}</td></tr>
      </table>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;border-left:4px solid #6366f1">
        <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;margin-bottom:6px">REASON</p>
        <p style="margin:0;color:#1e293b;font-size:14px;line-height:1.6">${reason.trim()}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Please review and assign a new tutor at your earliest convenience.</p>
    </div>
  `;

  const { sendEmail } = await import('../utils/emailService');
  const { createNotificationWithPreferences } = await import('./notificationService');

  const notifMessage = `${parentUser.name} has requested a tutor change for ${activeClass.studentName} (${subjectLabel}). Reason: ${reason.trim()}`;

  const tasks: Promise<any>[] = [];

  // Notify + email coordinator
  if (coordinator) {
    tasks.push(
      createNotificationWithPreferences({
        recipient: String(coordinator._id),
        type: 'GENERAL',
        title: 'Tutor Change Request',
        message: notifMessage,
      }).catch(() => {}),
    );
    if (coordinator.email) {
      tasks.push(
        sendEmail(coordinator.email, `Tutor Change Request — ${activeClass.studentName}`, emailHtml).catch(() => {}),
      );
    }
  }

  // Notify + email all admins
  const admins = await User.find({ role: USER_ROLES.ADMIN }).select('_id email name');
  for (const admin of admins) {
    tasks.push(
      createNotificationWithPreferences({
        recipient: String(admin._id),
        type: 'GENERAL',
        title: 'Tutor Change Request',
        message: notifMessage,
      }).catch(() => {}),
    );
    if (admin.email) {
      tasks.push(
        sendEmail(admin.email, `Tutor Change Request — ${activeClass.studentName}`, emailHtml).catch(() => {}),
      );
    }
  }

  await Promise.allSettled(tasks);
  return { requested: true };
};

export const getParentShiftRequests = async (userId: string) => {
  const activeClass = await FinalClass.findOne({ parent: userId, status: 'ACTIVE' });
  if (!activeClass) return [];
  return ShiftRequest.find({ finalClass: activeClass._id, requestedBy: userId })
    .sort({ createdAt: -1 })
    .lean();
};
