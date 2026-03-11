import 'dotenv/config';
import mongoose from 'mongoose';
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
  const onlyActive = process.env.ONLY_ACTIVE === undefined ? true : parseBool(process.env.ONLY_ACTIVE);

  console.log('[setStartDateTodayForExistingClasses] starting');
  console.log('dryRun:', dryRun);
  console.log('onlyActive:', onlyActive);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filter: any = {
    'schedule.daysOfWeek': { $exists: true, $ne: [] },
    'schedule.timeSlot': { $exists: true, $ne: '' },
    $or: [{ 'schedule.startDate': { $exists: false } }, { 'schedule.startDate': null }],
  };

  if (onlyActive) {
    filter.status = 'ACTIVE';
  }

  const matched = await FinalClass.countDocuments(filter);
  console.log('classes matched:', matched);

  if (matched === 0) {
    console.log('Nothing to update. Exiting.');
    return;
  }

  if (dryRun) {
    console.log('DRY_RUN=true, not writing changes. Would set schedule.startDate to:', today.toISOString());
    return;
  }

  const res = await FinalClass.updateMany(filter, { $set: { 'schedule.startDate': today } });

  console.log('updateMany result:', {
    matchedCount: (res as any).matchedCount,
    modifiedCount: (res as any).modifiedCount,
  });

  console.log('[setStartDateTodayForExistingClasses] done');
}

connect()
  .then(run)
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
