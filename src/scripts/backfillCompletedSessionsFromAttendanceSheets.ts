import 'dotenv/config';
import mongoose from 'mongoose';
import AttendanceSheet from '../models/AttendanceSheet';
import FinalClass from '../models/FinalClass';

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) {
    throw new Error('MONGODB_URI (or DATABASE_URL) is not set in environment');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

const parseBool = (v?: string) => String(v || '').toLowerCase() === 'true';

async function run() {
  const dryRun = parseBool(process.env.DRY_RUN);
  const onlyActive = parseBool(process.env.ONLY_ACTIVE);

  console.log('[backfillCompletedSessionsFromAttendanceSheets] starting');
  console.log('dryRun:', dryRun);
  console.log('onlyActive:', onlyActive);

  const matchFinalClass: any = { finalClass: { $exists: true, $ne: null } };

  const pipeline: any[] = [
    { $match: matchFinalClass },
    {
      $project: {
        finalClass: 1,
        totalFromSheets: {
          $size: {
            $filter: {
              input: '$records',
              as: 'r',
              cond: { $ne: ['$$r.status', 'REJECTED'] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$finalClass',
        completed: { $sum: '$totalFromSheets' },
      },
    },
  ];

  const perClass = await AttendanceSheet.aggregate(pipeline);
  console.log('classes found from sheets:', perClass.length);

  if (perClass.length === 0) {
    console.log('Nothing to backfill. Exiting.');
    return;
  }

  const classIds = perClass.map((x) => x._id);
  const finalClasses = await FinalClass.find({ _id: { $in: classIds } })
    .select('_id completedSessions classesPerMonth status')
    .lean();

  const byId = new Map<string, any>();
  for (const c of finalClasses) byId.set(String(c._id), c);

  let updates = 0;
  let skipped = 0;

  const bulk: any[] = [];

  for (const row of perClass) {
    const id = String(row._id);
    const fc = byId.get(id);
    if (!fc) {
      skipped++;
      continue;
    }

    if (onlyActive && String(fc.status) !== 'ACTIVE') {
      skipped++;
      continue;
    }

    const planned = typeof fc.classesPerMonth === 'number' && fc.classesPerMonth > 0 ? fc.classesPerMonth : undefined;
    const nextCompleted = planned ? Math.min(Number(row.completed || 0), planned) : Number(row.completed || 0);

    if (Number(fc.completedSessions || 0) === nextCompleted) {
      skipped++;
      continue;
    }

    updates++;
    bulk.push({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id) },
        update: { $set: { completedSessions: nextCompleted } },
      },
    });
  }

  console.log('will update:', updates);
  console.log('skipped:', skipped);

  if (dryRun) {
    console.log('DRY_RUN=true, not writing changes.');
    return;
  }

  if (bulk.length > 0) {
    const res = await FinalClass.bulkWrite(bulk, { ordered: false });
    console.log('bulkWrite result:', {
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
    });
  }

  console.log('[backfillCompletedSessionsFromAttendanceSheets] done');
}

connect()
  .then(run)
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
