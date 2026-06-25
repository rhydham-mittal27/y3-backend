/**
 * seedClassSessions.ts
 *
 * Backfill: for each ACTIVE FinalClass that has Attendance records but no
 * ClassSession records, generates sessions using the first attendance date as
 * the anchor (matching how the CycleStartDialog works for new classes).
 *
 * Also back-fills COMPLETED status on any PLANNED session that already has an
 * Attendance record for the same date.
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
import Attendance from '../models/Attendance';
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

  let totalGenerated = 0;
  let totalSkipped   = 0;
  let totalFailed    = 0;

  for (const cls of classes) {
    const schedule: any = cls.schedule || {};
    const days = (schedule.daysOfWeek || []).join(', ');
    const slot = schedule.timeSlot || '—';
    console.log(`► ${cls.className} (${cls.studentName}) | ${days} @ ${slot} | ${cls.classesPerMonth}x/mo`);

    // Check if sessions already exist for this class
    const existingCount = await ClassSession.countDocuments({ finalClass: cls._id });
    if (existingCount > 0) {
      console.log(`  → already has ${existingCount} sessions, skipping\n`);
      totalSkipped++;
      continue;
    }

    // Find the first attendance record for this class
    const firstAttendance = await Attendance.findOne({ finalClass: cls._id })
      .sort({ sessionDate: 1 })
      .select('sessionDate');

    if (!firstAttendance) {
      console.log(`  → no attendance records found, skipping (will generate when first class happens)\n`);
      totalSkipped++;
      continue;
    }

    const startDate = firstAttendance.sessionDate;
    console.log(`  → first attendance: ${startDate.toISOString().split('T')[0]}`);

    if (dryRun) {
      console.log(`  → [DRY RUN] would generate ${cls.classesPerMonth} sessions from ${startDate.toISOString().split('T')[0]}\n`);
      totalGenerated++;
      continue;
    }

    try {
      const cycleNumber = (cls as any).currentCycleNumber || 1;
      const docs = await generateSessionsFromStartDate({
        classId:     String(cls._id),
        startDate,
        cycleNumber,
      });
      console.log(`  → ✓ generated ${docs.length} sessions\n`);
      totalGenerated += docs.length;
    } catch (err: any) {
      if (err.message?.includes('E11000') || err.code === 11000) {
        console.log(`  → skipped (sessions already exist for these dates)\n`);
        totalSkipped++;
      } else {
        console.error(`  → ✗ FAILED: ${err.message}\n`);
        totalFailed++;
      }
    }
  }

  console.log('─────────────────────────────────');
  console.log(`Classes processed : ${classes.length}`);
  console.log(`Sessions generated: ${totalGenerated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Skipped           : ${totalSkipped}`);
  console.log(`Failures          : ${totalFailed}`);
  if (dryRun) console.log('\nRe-run with DRY_RUN=false to apply.');

  // ── Status back-fill ──────────────────────────────────────────────────────
  // Mark PLANNED sessions as COMPLETED where an Attendance record already exists.
  if (!dryRun) {
    console.log('\n► Back-filling COMPLETED status from attendance records…');
    const plannedSessions = await ClassSession.find({ status: 'PLANNED' }).select('_id finalClass sessionDate');
    let statusFixed = 0;
    for (const session of plannedSessions) {
      const dayStart = new Date(session.sessionDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      const hasAttendance = await Attendance.exists({
        finalClass: session.finalClass,
        sessionDate: { $gte: dayStart, $lte: dayEnd },
      });
      if (hasAttendance) {
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
