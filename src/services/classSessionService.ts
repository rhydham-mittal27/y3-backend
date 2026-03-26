import mongoose from 'mongoose';
import ErrorResponse from '../utils/errorResponse';
import FinalClass from '../models/FinalClass';
import ClassSession, { IClassSessionDocument } from '../models/ClassSession';

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const normalizeDayName = (d: string) => String(d || '').trim().toUpperCase();

const dayIndexToName = (date: Date) => {
  const weekdayIndex = (date.getDay() + 6) % 7; // Sun=0..Sat=6 -> Mon=0..Sun=6
  return DAYS_ORDER[weekdayIndex];
};

const startOfDay = (d: Date) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
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
}) => {
  const { classId, cycleMonth, cycleYear } = params;
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

  const anchorStart = computeCycleAnchorStart({ cycleMonth, cycleYear, scheduleStartDate });

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

  return sessionDocs;
};

export const getTutorSessionsForCycle = async (params: {
  tutorUserId: string;
  cycleMonth: number;
  cycleYear: number;
}) => {
  const { tutorUserId, cycleMonth, cycleYear } = params;
  if (!cycleMonth || !cycleYear) throw new ErrorResponse('cycleMonth and cycleYear are required', 400);

  const sessions = await ClassSession.find({
    tutor: new mongoose.Types.ObjectId(tutorUserId),
    cycleMonth,
    cycleYear,
  })
    .populate('finalClass')
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

  const sessions = await ClassSession.find({
    coordinator: new mongoose.Types.ObjectId(coordinatorUserId),
    cycleMonth,
    cycleYear,
  })
    .populate('finalClass')
    .sort({ sessionDate: 1, timeSlot: 1 });

  return sessions;
};
