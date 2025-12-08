import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import { createAdvancePaymentForFinalClass } from '../services/paymentService';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  // eslint-disable-next-line no-console
  console.error('[seedAdvancePayments] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log('[seedAdvancePayments] Connected to MongoDB');
}

async function main() {
  await connect();

  const classes = await FinalClass.find({}).select('_id').lean();
  // eslint-disable-next-line no-console
  console.log(`[seedAdvancePayments] Found ${classes.length} final classes`);

  let createdCount = 0;

  for (const cls of classes) {
    const classId = String(cls._id);
    const existing = await Payment.findOne({ finalClass: cls._id, attendance: { $exists: false } }).lean();
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[seedAdvancePayments] Skipping class ${classId} - advance payment already exists`);
      continue;
    }

    try {
      await createAdvancePaymentForFinalClass(classId, '000000000000000000000000');
      // eslint-disable-next-line no-console
      console.log(`[seedAdvancePayments] Created advance payment for class ${classId}`);
      createdCount += 1;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[seedAdvancePayments] Failed to create payment for class ${classId}:`, e?.message || e);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[seedAdvancePayments] Done. Created ${createdCount} advance payments.`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error('[seedAdvancePayments] Failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
