/**
 * seedClassSessions.ts
 *
 * One-time backfill: ensures every eligible ACTIVE FinalClass has ClassSession
 * records in MongoDB for the rolling window: 3 months back → 2 months ahead.
 *
 * Safe to re-run — generation is idempotent (upsert on finalClass+cycle+sessionNumber).
 *
 * Usage:
 *   DRY_RUN=true  npx ts-node -r tsconfig-paths/register src/scripts/seedClassSessions.ts
 *   DRY_RUN=false npx ts-node -r tsconfig-paths/register src/scripts/seedClassSessions.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import ClassSession from '../models/ClassSession';
import { generateClassSessionsForCycle } from '../services/classSessionService';

const MONTHS_BACK   = 3;
const MONTHS_AHEAD  = 2;

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');
}

function monthsInWindow(): Array<{ month: number; year: number }> {
  const now   = new Date();
  const cur   = { month: now.getMonth() + 1, year: now.getFullYear() };
  const result: Array<{ month: number; year: number }> = [];

  for (let delta = -MONTHS_BACK; delta <= MONTHS_AHEAD; delta++) {
    let m = cur.month + delta;
    let y = cur.year;
    while (m < 1)  { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    result.push({ month: m, year: y });
  }
  return result;
}

async function run() {
  const dryRun = String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
  console.log(`\n[seedClassSessions] DRY_RUN=${dryRun}`);
  console.log(`Window: ${MONTHS_BACK} months back → ${MONTHS_AHEAD} months ahead\n`);

  const window = monthsInWindow();
  console.log('Months to process:', window.map(w => `${w.year}-${String(w.month).padStart(2,'0')}`).join(', '));

  // Eligible: ACTIVE, has schedule, has daysOfWeek + timeSlot, has classesPerMonth, NOT cycleStartPending
  const classes = await FinalClass.find({
    status: 'ACTIVE',
    'schedule.daysOfWeek': { $exists: true, $not: { $size: 0 } },
    'schedule.timeSlot':   { $exists: true, $ne: '' },
    classesPerMonth:       { $exists: true, $gt: 0 },
    $or: [
      { cycleStartPending: { $exists: false } },
      { cycleStartPending: false },
    ],
  }).select('_id className studentName schedule classesPerMonth cycleStartPending');

  console.log(`\nFound ${classes.length} eligible ACTIVE classes\n`);

  let totalGenerated = 0;
  let totalSkipped   = 0;
  let totalFailed    = 0;

  for (const cls of classes) {
    const schedule: any = cls.schedule || {};
    const days    = (schedule.daysOfWeek || []).join(', ');
    const slot    = schedule.timeSlot || '—';
    console.log(`\n► ${cls.className} (${cls.studentName}) | ${days} @ ${slot} | ${cls.classesPerMonth}x/mo`);

    for (const { month, year } of window) {
      const label = `${year}-${String(month).padStart(2,'0')}`;

      // Check if sessions already exist for this cycle
      const existing = await ClassSession.countDocuments({
        finalClass: cls._id,
        cycleYear:  year,
        cycleMonth: month,
      });

      if (existing > 0) {
        console.log(`  ${label} — already has ${existing} sessions, skipping`);
        totalSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  ${label} — [DRY RUN] would generate ${cls.classesPerMonth} sessions`);
        totalGenerated++;
        continue;
      }

      try {
        const docs = await generateClassSessionsForCycle({
          classId:    String(cls._id),
          cycleMonth: month,
          cycleYear:  year,
        });
        console.log(`  ${label} — ✓ generated ${docs.length} sessions`);
        totalGenerated += docs.length;
      } catch (err: any) {
        console.error(`  ${label} — ✗ FAILED: ${err.message}`);
        totalFailed++;
      }
    }
  }

  console.log('\n─────────────────────────────────');
  console.log(`Classes processed : ${classes.length}`);
  console.log(`Sessions generated: ${totalGenerated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Cycles skipped    : ${totalSkipped} (already had data)`);
  console.log(`Failures          : ${totalFailed}`);
  if (dryRun) console.log('\nRe-run with DRY_RUN=false to apply.');
}

connect()
  .then(run)
  .then(() => { console.log('\nDone.'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
