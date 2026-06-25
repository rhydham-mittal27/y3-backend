/**
 * seedClassSessions.ts
 *
 * Backfill ClassSession records for existing ACTIVE classes by reading their
 * AttendanceSheet history:
 *
 *   For each class → for each AttendanceSheet (one per cycle):
 *     1. Find the earliest sessionDate in that sheet's records[]
 *     2. Call generateSessionsFromStartDate(classId, firstDate, cycleNumber)
 *        → generates N sessions (classesPerMonth) following the weekly schedule
 *     3. Mark generated sessions as COMPLETED where attendance already exists
 *
 * Classes with no AttendanceSheet records are reset to cycleStartPending=true
 * so the CycleStartDialog prompts the tutor on next login.
 *
 * Safe to re-run — skips classes that already have ClassSession records.
 *
 * Usage:
 *   DRY_RUN=true  npx ts-node -r tsconfig-paths/register src/scripts/seedClassSessions.ts
 *   DRY_RUN=false npx ts-node -r tsconfig-paths/register src/scripts/seedClassSessions.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import ClassSession from '../models/ClassSession';
import AttendanceSheet from '../models/AttendanceSheet';
import { generateSessionsFromStartDate } from '../services/classSessionService';

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');
}

async function run() {
  const dryRun = String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
  console.log(`\n[seedClassSessions] DRY_RUN=${dryRun}\n`);

  // All eligible ACTIVE classes (has schedule + classesPerMonth, not cycleStartPending)
  const classes = await FinalClass.find({
    status: 'ACTIVE',
    'schedule.daysOfWeek': { $exists: true, $not: { $size: 0 } },
    'schedule.timeSlot':   { $exists: true, $ne: '' },
    classesPerMonth:       { $exists: true, $gt: 0 },
    $or: [
      { cycleStartPending: { $exists: false } },
      { cycleStartPending: false },
    ],
  }).select('_id className studentName schedule classesPerMonth currentCycleNumber');

  console.log(`Found ${classes.length} eligible ACTIVE classes\n`);

  let totalSessionsGenerated = 0;
  let totalCyclesProcessed   = 0;
  let totalCyclesSkipped     = 0;
  let totalFailed            = 0;
  let classesResetPending    = 0;

  for (const cls of classes) {
    const schedule: any = cls.schedule || {};
    const days = (schedule.daysOfWeek || []).join(', ');
    const slot = schedule.timeSlot || '—';
    console.log(`► ${cls.className} (${cls.studentName}) | ${days} @ ${slot} | ${cls.classesPerMonth}x/mo`);

    // Skip if sessions already exist for this class
    const existingCount = await ClassSession.countDocuments({ finalClass: cls._id });
    if (existingCount > 0) {
      console.log(`  → already has ${existingCount} sessions, skipping\n`);
      totalCyclesSkipped++;
      continue;
    }

    // Find all AttendanceSheets for this class, ordered by cycleNumber
    const sheets = await AttendanceSheet.find({ finalClass: cls._id })
      .sort({ cycleNumber: 1 })
      .select('cycleNumber records');

    if (!sheets.length) {
      // No attendance history — reset cycleStartPending so the dialog prompts the tutor
      if (!dryRun) {
        await FinalClass.findByIdAndUpdate(cls._id, { cycleStartPending: true });
        console.log(`  → no AttendanceSheet found, reset cycleStartPending=true\n`);
      } else {
        console.log(`  → [DRY RUN] no AttendanceSheet found, would reset cycleStartPending=true\n`);
      }
      classesResetPending++;
      continue;
    }

    console.log(`  → found ${sheets.length} AttendanceSheet(s)`);

    for (const sheet of sheets) {
      const cycleNumber = sheet.cycleNumber;
      const records: any[] = sheet.records || [];

      if (!records.length) {
        console.log(`    Cycle ${cycleNumber} — no records, skipping`);
        totalCyclesSkipped++;
        continue;
      }

      // Earliest sessionDate in this sheet's records
      const firstDate: Date = records
        .map((r: any) => new Date(r.sessionDate))
        .sort((a, b) => a.getTime() - b.getTime())[0];

      console.log(`    Cycle ${cycleNumber} — first attendance: ${firstDate.toISOString().split('T')[0]}`);

      if (dryRun) {
        console.log(`    Cycle ${cycleNumber} — [DRY RUN] would generate ${cls.classesPerMonth} sessions from ${firstDate.toISOString().split('T')[0]}`);
        totalCyclesProcessed++;
        totalSessionsGenerated += cls.classesPerMonth ?? 0;
        continue;
      }

      try {
        const docs = await generateSessionsFromStartDate({
          classId:     String(cls._id),
          startDate:   firstDate,
          cycleNumber,
        });
        console.log(`    Cycle ${cycleNumber} — ✓ generated ${docs.length} sessions`);
        totalCyclesProcessed++;
        totalSessionsGenerated += docs.length;
      } catch (err: any) {
        if (err.message?.includes('E11000') || err.code === 11000) {
          console.log(`    Cycle ${cycleNumber} — skipped (sessions already exist for these dates)`);
          totalCyclesSkipped++;
        } else {
          console.error(`    Cycle ${cycleNumber} — ✗ FAILED: ${err.message}`);
          totalFailed++;
        }
      }
    }

    console.log('');
  }

  console.log('─────────────────────────────────');
  console.log(`Classes processed       : ${classes.length}`);
  console.log(`Cycles seeded           : ${totalCyclesProcessed}`);
  console.log(`Sessions generated      : ${totalSessionsGenerated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Cycles skipped          : ${totalCyclesSkipped}`);
  console.log(`Classes reset pending   : ${classesResetPending}`);
  console.log(`Failures                : ${totalFailed}`);
  if (dryRun) console.log('\nRe-run with DRY_RUN=false to apply.');

  // ── Status back-fill ──────────────────────────────────────────────────────
  // For each PLANNED session, if an AttendanceSheet record exists for that class
  // on the same date, mark the session COMPLETED.
  if (!dryRun) {
    console.log('\n► Back-filling COMPLETED status from AttendanceSheet records…');
    const plannedSessions = await ClassSession.find({ status: 'PLANNED' })
      .select('_id finalClass sessionDate');

    let statusFixed = 0;
    for (const session of plannedSessions) {
      const dayStart = new Date(session.sessionDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

      const hasRecord = await AttendanceSheet.exists({
        finalClass: session.finalClass,
        'records.sessionDate': { $gte: dayStart, $lte: dayEnd },
      });

      if (hasRecord) {
        await ClassSession.findByIdAndUpdate(session._id, { $set: { status: 'COMPLETED' } });
        statusFixed++;
      }
    }
    console.log(`  Status fixed: ${statusFixed} sessions → COMPLETED`);
  }
}

connect()
  .then(run)
  .then(() => { console.log('\nDone.'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
