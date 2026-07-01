import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Payment from '../models/Payment';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI || '');
  console.log(`[backfillPaymentIds] Connected: ${conn.connection.host}`);
};

const backfill = async () => {
  await connectDB();

  const payments = await Payment.find({
    $or: [{ paymentId: { $exists: false } }, { paymentId: null }, { paymentId: '' }],
  }).sort({ createdAt: 1 });

  console.log(`[backfillPaymentIds] Found ${payments.length} payments without paymentId`);

  let updated = 0;
  let failed = 0;

  for (const payment of payments) {
    const year = new Date((payment as any).createdAt || Date.now()).getFullYear();
    const prefix = `PAY-${year}-`;

    // Find highest existing paymentId for this year
    const last = await Payment.findOne({ paymentId: { $regex: `^${prefix}` } })
      .sort({ paymentId: -1 })
      .select('paymentId')
      .lean();

    const lastNum = last?.paymentId ? parseInt(last.paymentId.split('-')[2] ?? '0', 10) : 0;
    const newId = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;

    try {
      await Payment.findByIdAndUpdate(payment._id, { paymentId: newId });
      console.log(`  ✓ ${payment._id} → ${newId}`);
      updated++;
    } catch (err: any) {
      console.error(`  ✗ ${payment._id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[backfillPaymentIds] Done — updated: ${updated}, failed: ${failed}`);
  await mongoose.disconnect();
};

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
