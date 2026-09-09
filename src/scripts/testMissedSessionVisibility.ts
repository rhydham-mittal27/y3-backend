/**
 * End-to-end test for the coordinator attendance-visibility fix:
 *   - generate Cycle 1 timetable
 *   - mark attendance for only SOME sessions (simulate real missed classes)
 *   - force-complete the cycle (as if the counter had reached the limit some
 *     other way) and start Cycle 2
 *   - verify: unmarked Cycle 1 sessions flip to MISSED (not deleted)
 *   - verify: Cycle 2 can reuse a date a MISSED session already occupies
 *     (proves the partial unique index works)
 *   - verify: the new cycle-scoped endpoint returns everything, including
 *     MISSED sessions and sessions spanning into a second calendar month
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/testMissedSessionVisibility.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import ClassSession from '../models/ClassSession';
import AttendanceSheet from '../models/AttendanceSheet';
import { addDailyAttendance } from '../services/attendanceSheetService';
import { generateSessionsFromStartDate, getSessionsByCycleNumber } from '../services/classSessionService';
import { USER_ROLES } from '../config/constants';

const TEST_DB_URI =
  process.env.TEST_MONGODB_URI ||
  (process.env.MONGODB_URI || '').replace(/\/[^/?]+(\?|$)/, '/timetable-test-db$1');

async function run() {
  await mongoose.connect(TEST_DB_URI);
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  const classId = process.env.CLASS_ID;
  if (!classId) throw new Error('Set CLASS_ID to a cycleStartPending class (from seedTimetableTest.ts output)');

  const cls: any = await FinalClass.findById(classId);
  if (!cls) throw new Error('Class not found');
  if (!cls.cycleStartPending) throw new Error('Class is not cycleStartPending');

  // --- Step 1: generate Cycle 1 starting today ---
  const cycle1 = cls.currentCycleNumber || 1;
  const start = new Date();
  const sessions1 = await generateSessionsFromStartDate({ classId, startDate: start, cycleNumber: cycle1 });
  console.log(`Cycle ${cycle1}: generated ${sessions1.length} sessions, ${sessions1[0].sessionDate.toISOString().split('T')[0]} -> ${sessions1[sessions1.length - 1].sessionDate.toISOString().split('T')[0]}`);

  await AttendanceSheet.findOneAndUpdate(
    { finalClass: cls._id, cycleNumber: cycle1 },
    { $setOnInsert: {
        finalClass: cls._id, sheetType: 'SINGLE', coordinator: cls.coordinator,
        month: start.getMonth() + 1, year: start.getFullYear(), cycleNumber: cycle1,
        periodLabel: `Cycle ${cycle1}`, records: [], status: 'PENDING', createdBy: cls.coordinator,
        totalSessionsPlanned: cls.classesPerMonth || 0,
      } },
    { upsert: true },
  );
  await FinalClass.findByIdAndUpdate(classId, { cycleStartPending: false });

  // --- Step 2: mark attendance for only the first 8 of 12 sessions (4 left MISSED) ---
  const toMark = sessions1.slice(0, 8);
  for (const s of toMark) {
    await addDailyAttendance({
      finalClassId: classId,
      sessionDate: s.sessionDate,
      topicCovered: 'test',
      studentAttendanceStatus: 'PRESENT',
      userId: String(cls.coordinator),
      userRole: USER_ROLES.COORDINATOR,
    });
  }
  console.log(`Marked attendance for ${toMark.length}/${sessions1.length} sessions (${sessions1.length - toMark.length} left unmarked to simulate misses)`);

  // --- Step 3: force cycle completion (bypass needing all 12 marked) and flip to next cycle,
  // reusing the exact same cleanup logic as setCycleStartController ---
  const cycle2 = cycle1 + 1;
  await FinalClass.findByIdAndUpdate(classId, { cycleStartPending: true, currentCycleNumber: cycle2, completedSessions: 0 });

  await ClassSession.deleteMany({ finalClass: cls._id, status: 'PLANNED', cycleNumber: { $exists: false } });
  await ClassSession.updateMany(
    { finalClass: cls._id, status: 'PLANNED', cycleNumber: { $lt: cycle2 } },
    { $set: { status: 'MISSED' } },
  );

  const missedCount = await ClassSession.countDocuments({ finalClass: cls._id, status: 'MISSED' });
  console.log(`\nAfter cycle rollover: ${missedCount} session(s) flipped to MISSED (expected 4)`);

  // --- Step 4: start Cycle 2, deliberately choosing a date that collides with
  // a MISSED session's date, to prove the partial index allows it ---
  const missedSessions = await ClassSession.find({ finalClass: cls._id, status: 'MISSED' }).sort({ sessionDate: 1 });
  const collidingDate = missedSessions[missedSessions.length - 1].sessionDate; // last (latest) missed date
  console.log(`Starting Cycle ${cycle2} on ${collidingDate.toISOString().split('T')[0]} — same date as a MISSED session (should NOT crash)`);

  let sessions2: any[];
  try {
    sessions2 = await generateSessionsFromStartDate({ classId, startDate: collidingDate, cycleNumber: cycle2 });
    console.log(`✓ Cycle ${cycle2} generated successfully: ${sessions2.length} sessions, no collision with the MISSED session on the same date`);
  } catch (e: any) {
    console.error(`✗ FAILED — collision still occurs: ${e.message}`);
    throw e;
  }

  // --- Step 5: verify the new cycle-scoped endpoint returns everything for Cycle 1
  // (both COMPLETED and MISSED, regardless of month span) ---
  const cycle1Sessions = await getSessionsByCycleNumber({ classId, cycleNumber: cycle1 });
  const statusCounts: Record<string, number> = {};
  for (const s of cycle1Sessions as any[]) statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  console.log(`\nCycle ${cycle1} via getSessionsByCycleNumber: ${cycle1Sessions.length} total ->`, statusCounts);

  const monthsSpanned = new Set((cycle1Sessions as any[]).map((s) => `${s.sessionDate.getUTCFullYear()}-${s.sessionDate.getUTCMonth() + 1}`));
  console.log(`Calendar months spanned by Cycle ${cycle1}: ${[...monthsSpanned].join(', ')}`);

  console.log('\n─────────────────────────────────────────────');
  console.log(statusCounts.MISSED === 4 && statusCounts.COMPLETED === 8
    ? 'PASS: all 12 Cycle 1 sessions accounted for (8 COMPLETED + 4 MISSED), none lost'
    : 'FAIL: unexpected status distribution');
  console.log('─────────────────────────────────────────────');

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
