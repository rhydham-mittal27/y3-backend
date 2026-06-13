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

export const raiseParentConcern = async (
  userId: string,
  finalClassId: string,
  message: string,
) => {
  const cls = await FinalClass.findOne({ _id: finalClassId, parent: userId });
  if (!cls) throw new ErrorResponse('Class not found or not authorized', 404);

  const user = await User.findById(userId).select('name');
  const title = `Parent Concern — ${cls.studentName}`;
  const body  = `From: ${user?.name ?? 'Parent'} | Class: ${cls.className} | ${message}`;

  const recipients: any[] = [];
  if (cls.coordinator) recipients.push(cls.coordinator);

  // Also notify the class tutor
  if (cls.tutor) recipients.push(cls.tutor);

  await Promise.all(
    recipients.map((recipientId) =>
      Notification.create({
        recipient: recipientId,
        type:      'GENERAL',
        title,
        message:   body,
      }),
    ),
  );

  return { raised: true };
};
