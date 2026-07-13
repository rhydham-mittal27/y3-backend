import mongoose from 'mongoose';
import ErrorResponse from '../utils/errorResponse';
import FinalClass from '../models/FinalClass';
import Groupleads from '../models/GroupClass';
import ClassSession, { IClassSessionDocument } from '../models/ClassSession';
import Attendance from '../models/Attendance';

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const normalizeDayName = (d: string) => String(d || '').trim().toUpperCase();

const dayIndexToName = (date: Date) => {
  const weekdayIndex = (date.getUTCDay() + 6) % 7; // Sun=0..Sat=6 -> Mon=0..Sun=6
  return DAYS_ORDER[weekdayIndex];
};

const startOfDay = (d: Date) => {
  const nd = new Date(d);
  nd.setUTCHours(0, 0, 0, 0);
  return nd;
};

export const computeCycleAnchorStart = (params: {
  cycleMonth: number;
  cycleYear: number;
  scheduleStartDate?: Date;
}) => {
  const { cycleMonth, cycleYear, scheduleStartDate } = params;
  const monthStart = startOfDay(new Date(cycleYear, cycleMonth - 1, 1));
  if (!scheduleStartDate) return monthStart;

  const sched = startOfDay(new Date(scheduleStartDate));
  return sched.getTime() > monthStart.getTime() ? sched : monthStart;
};

export const generateClassSessionsForCycle = async (params: {
  classId: string;
  cycleMonth: number;
  cycleYear: number;
  actorUserId?: string;
  /** When provided, sessions start from this exact date instead of the first-of-month anchor. */
  anchorDate?: Date;
}) => {
  const { classId, cycleMonth, cycleYear, anchorDate } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and cycleYear are required', 400);
  if (cycleMonth < 1 || cycleMonth > 12) throw new ErrorResponse('Invalid cycleMonth', 400);

  const cls: any = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);

  const schedule: any = cls.schedule || {};
  const daysOfWeek: string[] = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek.map(normalizeDayName) : [];
  const timeSlot: string = String(schedule.timeSlot || '').trim();
  const scheduleStartDate: Date | undefined = schedule.startDate
    ? new Date(schedule.startDate)
    : cls.startDate
      ? new Date(cls.startDate)
      : undefined;

  if (!daysOfWeek.length) throw new ErrorResponse('Schedule daysOfWeek is required to generate sessions', 400);
  if (!timeSlot) throw new ErrorResponse('Schedule timeSlot is required to generate sessions', 400);

  const n = Number(cls.classesPerMonth || cls.totalSessions || 0);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorResponse('classesPerMonth must be set to generate sessions', 400);

  // If anchorDate is explicitly provided (e.g. from first attendance), use it directly.
  // Otherwise fall back to the month-based anchor computation.
  const anchorStart = anchorDate
    ? startOfDay(new Date(anchorDate))
    : computeCycleAnchorStart({ cycleMonth, cycleYear, scheduleStartDate });

  // Iterate day-by-day until we generate N sessions. Spill-over into next month is allowed.
  const pickedDates: Date[] = [];
  for (let d = new Date(anchorStart); pickedDates.length < n; d.setDate(d.getDate() + 1)) {
    const dayName = dayIndexToName(d);
    if (!daysOfWeek.includes(dayName)) continue;
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    pickedDates.push(new Date(dt));

    // safety guard
    if (pickedDates.length > n + 1000) break;
  }

  const sessionDocs: IClassSessionDocument[] = [] as any;

  // Upsert session docs for this cycle to be idempotent.
  for (let i = 0; i < pickedDates.length; i += 1) {
    const sessionNumber = i + 1;
    const sessionDate = pickedDates[i];

    const doc = await ClassSession.findOneAndUpdate(
      { finalClass: cls._id, cycleYear, cycleMonth, sessionNumber },
      {
        $setOnInsert: {
          finalClass: cls._id,
          status: 'PLANNED',
        },
        $set: {
          sessionDate,
          timeSlot,
          tutor: cls.tutor,
          coordinator: cls.coordinator,
        },
      },
      { new: true, upsert: true }
    );

    sessionDocs.push(doc as any);
  }

  // Back-fill status for sessions that already have an Attendance record.
  // This handles the case where attendance was submitted before ClassSession records existed.
  await Promise.all(
    sessionDocs.map(async (session: any) => {
      if (session.status !== 'PLANNED') return; // already COMPLETED or CANCELLED
      const sessionDayStart = startOfDay(new Date(session.sessionDate));
      const sessionDayEnd   = new Date(sessionDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      const attendance = await Attendance.findOne({
        finalClass: cls._id,
        sessionDate: { $gte: sessionDayStart, $lte: sessionDayEnd },
      }).select('_id');
      if (attendance) {
        await ClassSession.findByIdAndUpdate(session._id, { $set: { status: 'COMPLETED' } });
        session.status = 'COMPLETED';
      }
    })
  );

  return sessionDocs;
};

export const generateGroupClassSessionsForCycle = async (params: {
  groupClassId: string;
  cycleMonth: number;
  cycleYear: number;
  /** When provided, sessions start from this exact date instead of the first-of-month anchor. */
  anchorDate?: Date;
}) => {
  const { groupClassId, cycleMonth, cycleYear, anchorDate } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and cycleYear are required', 400);
  if (cycleMonth < 1 || cycleMonth > 12) throw new ErrorResponse('Invalid cycleMonth', 400);

  const cls: any = await Groupleads.findById(groupClassId);
  if (!cls) throw new ErrorResponse('Group class not found', 404);

  const schedule: any = cls.schedule || {};
  const daysOfWeek: string[] = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek.map(normalizeDayName) : [];
  const timeSlot: string = String(schedule.timeSlot || '').trim();

  if (!daysOfWeek.length) throw new ErrorResponse('Schedule daysOfWeek is required to generate sessions', 400);
  if (!timeSlot) throw new ErrorResponse('Schedule timeSlot is required to generate sessions', 400);

  const n = Number(cls.sessionsPerMonth || 0);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorResponse('sessionsPerMonth must be set to generate sessions', 400);

  const anchorStart = anchorDate
    ? startOfDay(new Date(anchorDate))
    : computeCycleAnchorStart({ cycleMonth, cycleYear });

  const pickedDates: Date[] = [];
  for (let d = new Date(anchorStart); pickedDates.length < n; d.setDate(d.getDate() + 1)) {
    const dayName = dayIndexToName(d);
    if (!daysOfWeek.includes(dayName)) continue;
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    pickedDates.push(new Date(dt));

    if (pickedDates.length > n + 1000) break;
  }

  const sessionDocs: IClassSessionDocument[] = [] as any;

  for (let i = 0; i < pickedDates.length; i += 1) {
    const sessionNumber = i + 1;
    const sessionDate = pickedDates[i];

    const doc = await ClassSession.findOneAndUpdate(
      { groupClass: cls._id, cycleYear, cycleMonth, sessionNumber },
      {
        $setOnInsert: {
          groupClass: cls._id,
          status: 'PLANNED',
        },
        $set: {
          sessionDate,
          timeSlot,
          tutor: cls.tutor,
        },
      },
      { new: true, upsert: true }
    );

    sessionDocs.push(doc as any);
  }

  return sessionDocs;
};

/**
 * Generates ClassSessions for a cycle starting from a tutor-chosen date.
 * Uses cycleNumber (not month/year) as the primary cycle identifier.
 */
export const generateSessionsFromStartDate = async (params: {
  classId: string;
  startDate: Date;
  cycleNumber: number;
}) => {
  const { classId, startDate, cycleNumber } = params;

  const cls: any = await FinalClass.findById(classId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);

  const schedule: any = cls.schedule || {};
  const daysOfWeek: string[] = Array.isArray(schedule.daysOfWeek)
    ? schedule.daysOfWeek.map(normalizeDayName)
    : [];
  const timeSlot: string = String(schedule.timeSlot || '').trim();

  if (!daysOfWeek.length) throw new ErrorResponse('Schedule daysOfWeek is required to generate sessions', 400);
  if (!timeSlot) throw new ErrorResponse('Schedule timeSlot is required to generate sessions', 400);

  const n = Number(cls.classesPerMonth || 0);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorResponse('classesPerMonth must be set to generate sessions', 400);

  const anchor = startOfDay(new Date(startDate));

  const pickedDates: Date[] = [];
  for (let d = new Date(anchor); pickedDates.length < n; d.setDate(d.getDate() + 1)) {
    const dayName = dayIndexToName(d);
    if (!daysOfWeek.includes(dayName)) continue;
    pickedDates.push(new Date(d));
    if (pickedDates.length > n + 1000) break;
  }

  const sessionDocs: IClassSessionDocument[] = [];
  for (let i = 0; i < pickedDates.length; i++) {
    const sessionDate = pickedDates[i];
    const doc = await ClassSession.findOneAndUpdate(
      { finalClass: cls._id, cycleNumber, sessionNumber: i + 1 },
      {
        $setOnInsert: { finalClass: cls._id, status: 'PLANNED' },
        $set: {
          sessionDate,
          timeSlot,
          tutor: cls.tutor,
          coordinator: cls.coordinator,
          cycleMonth: sessionDate.getMonth() + 1,
          cycleYear: sessionDate.getFullYear(),
          cycleNumber,
        },
      },
      { new: true, upsert: true },
    );
    sessionDocs.push(doc as any);
  }

  // Back-fill COMPLETED status from existing attendance records
  await Promise.all(
    sessionDocs.map(async (session: any) => {
      if (session.status !== 'PLANNED') return;
      const sessionDayStart = startOfDay(new Date(session.sessionDate));
      const sessionDayEnd   = new Date(sessionDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      const attendance = await Attendance.findOne({
        finalClass: cls._id,
        sessionDate: { $gte: sessionDayStart, $lte: sessionDayEnd },
      }).select('_id');
      if (attendance) {
        await ClassSession.findByIdAndUpdate(session._id, { $set: { status: 'COMPLETED' } });
        session.status = 'COMPLETED';
      }
    })
  );

  return sessionDocs;
};

export const getSessionsByCycleNumber = async (params: {
  classId: string;
  cycleNumber: number;
}) => {
  const { classId, cycleNumber } = params;
  return ClassSession.find({
    finalClass: new mongoose.Types.ObjectId(classId),
    cycleNumber,
  }).sort({ sessionDate: 1 });
};

/**
 * Shifts all PLANNED ClassSessions for a class+cycle by shiftDays.
 * Only moves sessions that are still in PLANNED status.
 */
export const applyShiftToPlannedSessions = async (params: {
  classId: string;
  cycleNumber: number;
  shiftDays: number;
}) => {
  const { classId, cycleNumber, shiftDays } = params;

  // ClassSession uses cycleMonth/cycleYear, not cycleNumber directly.
  // We find sessions by finalClass + PLANNED status, then filter by matching
  // the cycle via the AttendanceSheet cycleNumber through sessionNumber ordering.
  // Simplest approach: find all PLANNED sessions for the class, ordered by date,
  // grouped by (cycleYear, cycleMonth). The cycleNumber maps to the Nth distinct
  // (cycleYear, cycleMonth) group when sorted ascending.
  const allPlanned = await ClassSession.find({
    finalClass: new mongoose.Types.ObjectId(classId),
    status: 'PLANNED',
  }).sort({ sessionDate: 1 });

  // Group into cycles by (cycleYear, cycleMonth) in chronological order
  const cycleGroups: Map<string, typeof allPlanned> = new Map();
  for (const s of allPlanned) {
    const key = `${s.cycleYear}-${String(s.cycleMonth).padStart(2, '0')}`;
    if (!cycleGroups.has(key)) cycleGroups.set(key, []);
    cycleGroups.get(key)!.push(s);
  }

  const sortedKeys = Array.from(cycleGroups.keys()).sort();
  const targetKey = sortedKeys[cycleNumber - 1];
  if (!targetKey) return [];

  const sessions = cycleGroups.get(targetKey)!;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const updated = await Promise.all(
    sessions.map((s) => {
      const newDate = new Date(s.sessionDate.getTime() + shiftDays * MS_PER_DAY);
      newDate.setHours(0, 0, 0, 0);
      return ClassSession.findByIdAndUpdate(
        s._id,
        { $set: { sessionDate: newDate } },
        { new: true },
      );
    }),
  );

  return updated.filter(Boolean);
};

export const getTutorSessionsForCycle = async (params: {
  tutorUserId: string;
  cycleMonth: number;
  cycleYear: number;
}) => {
  const { tutorUserId, cycleMonth, cycleYear } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and cycleYear are required', 400);

  // Query by sessionDate range to catch sessions whose cycleMonth/cycleYear
  // may have been set from a different cycle window (e.g. spill-overs from prior month seed).
  const monthStart = new Date(Date.UTC(cycleYear, cycleMonth - 1, 1));
  const monthEnd   = new Date(Date.UTC(cycleYear, cycleMonth, 0, 23, 59, 59, 999));

  const sessions = await ClassSession.find({
    tutor: new mongoose.Types.ObjectId(tutorUserId),
    sessionDate: { $gte: monthStart, $lte: monthEnd },
    status: { $ne: 'CANCELLED' },
  })
    .populate({
      path: 'finalClass',
      populate: { path: 'subject', select: 'label value name' },
    })
    .sort({ sessionDate: 1, timeSlot: 1 });

  return sessions;
};

export const getCoordinatorSessionsForCycle = async (params: {
  coordinatorUserId: string;
  cycleMonth: number;
  cycleYear: number;
}) => {
  const { coordinatorUserId, cycleMonth, cycleYear } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and year are required', 400);

  const monthStart = new Date(Date.UTC(cycleYear, cycleMonth - 1, 1));
  const monthEnd   = new Date(Date.UTC(cycleYear, cycleMonth, 0, 23, 59, 59, 999));

  const sessions = await ClassSession.find({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    sessionDate: { $gte: monthStart, $lte: monthEnd },
  })
    .populate({
      path: 'finalClass',
      populate: { path: 'classLead', select: 'classDurationHours studentName grade board' }
    })
    .populate({
      path: 'groupClass',
      populate: { path: 'classLead', select: 'classDurationHours name grade board' }
    })
    .sort({ sessionDate: 1, timeSlot: 1 });

  return sessions;
};

export const getClassSessionsForCycle = async (params: {
  classId: string;
  cycleMonth: number;
  cycleYear: number;
}) => {
  const { classId, cycleMonth, cycleYear } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and year are required', 400);

  const monthStart = new Date(Date.UTC(cycleYear, cycleMonth - 1, 1));
  const monthEnd   = new Date(Date.UTC(cycleYear, cycleMonth, 0, 23, 59, 59, 999));

  const sessions = await ClassSession.find({
    $or: [
      { finalClass: new mongoose.Types.ObjectId(classId) },
      { groupClass: new mongoose.Types.ObjectId(classId) },
    ],
    sessionDate: { $gte: monthStart, $lte: monthEnd },
  })
    .populate({
      path: 'finalClass',
      populate: { path: 'classLead', select: 'classDurationHours studentName grade board' }
    })
    .populate({
      path: 'groupClass',
      populate: { path: 'classLead', select: 'classDurationHours name grade board' }
    })
    .sort({ sessionDate: 1, timeSlot: 1 });

  return sessions;
};

/**
 * Reschedule a single PLANNED ClassSession to a new date (and optionally a new time slot).
 * Updates cycleMonth/cycleYear to reflect the new date.
 */
export const rescheduleSession = async (params: {
  sessionId: string;
  newDate: Date;
  newTimeSlot?: string;
  actorUserId: string;
  isAdmin?: boolean;
}) => {
  const { sessionId, newDate, newTimeSlot, actorUserId, isAdmin } = params;

  const session = await ClassSession.findById(sessionId);
  if (!session) throw new ErrorResponse('Session not found', 404);

  if (session.status !== 'PLANNED') {
    throw new ErrorResponse(
      `Cannot reschedule a session that is already ${session.status.toLowerCase()}`,
      400,
    );
  }

  if (!isAdmin && String(session.tutor) !== String(actorUserId)) {
    throw new ErrorResponse('Not authorised to reschedule this session', 403);
  }

  const date = startOfDay(new Date(newDate));
  session.sessionDate = date;
  session.cycleMonth  = date.getMonth() + 1;
  session.cycleYear   = date.getFullYear();
  if (newTimeSlot) session.timeSlot = newTimeSlot;

  await session.save();
  return session;
};
