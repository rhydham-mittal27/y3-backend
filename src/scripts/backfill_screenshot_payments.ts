import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Tutor from '../models/Tutor';
import Payment from '../models/Payment';
import { PAYMENT_TYPE, PAYMENT_STATUS, VERIFICATION_FEE_AMOUNT } from '../config/constants';

const backfill = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to MongoDB');

  // Find tutors who have a screenshot uploaded but feeStatus is still PENDING or PAID
  // (i.e. they uploaded proof but the Payment record was never created due to the silent-swallow bug)
  const tutors = await Tutor.find({
    verificationFeePaymentProof: { $exists: true, $nin: [null, ''] },
    verificationFeeStatus: { $in: ['PENDING', 'PAID'] },
  }).select('_id user verificationFeeStatus verificationFeePaymentProof verificationFeePaymentDate teacherId');

  console.log(`Found ${tutors.length} tutors with screenshot uploaded`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const tutor of tutors) {
    const userId = new mongoose.Types.ObjectId(String(tutor.user));

    const existing = await Payment.findOne({
      tutor: userId,
      paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
      paymentProof: { $exists: true, $ne: null },
    });

    if (existing) {
      console.log(`  SKIP ${tutor.teacherId || tutor._id} — payment record already has proof`);
      skipped++;
      continue;
    }

    const paymentStatus = tutor.verificationFeeStatus === 'PAID'
      ? PAYMENT_STATUS.PAID
      : PAYMENT_STATUS.PENDING;

    const notes = tutor.verificationFeeStatus === 'PAID'
      ? 'Paid via screenshot (backfilled)'
      : 'Awaiting admin verification (backfilled)';

    const paymentDate = tutor.verificationFeePaymentDate || new Date();

    try {
      const existingAny = await Payment.findOne({
        tutor: userId,
        paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
      });

      if (existingAny) {
        // Tutor switched from DEDUCT to pay-now — update to ₹500 + proof
        await Payment.updateOne(
          { _id: existingAny._id },
          {
            $set: {
              amount: VERIFICATION_FEE_AMOUNT,
              status: paymentStatus,
              paymentProof: tutor.verificationFeePaymentProof,
              paymentDate,
              notes,
            },
          }
        );
        console.log(`  UPDATE ${tutor.teacherId || tutor._id} — switched from DEDUCT to screenshot (was ₹${existingAny.amount} → ₹${VERIFICATION_FEE_AMOUNT}, ${paymentStatus})`);
      } else {
        await Payment.create({
          tutor: userId,
          amount: VERIFICATION_FEE_AMOUNT,
          currency: 'INR',
          status: paymentStatus,
          paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
          dueDate: paymentDate,
          paymentDate,
          paymentProof: tutor.verificationFeePaymentProof,
          notes,
          createdBy: userId,
        });
        console.log(`  CREATE ${tutor.teacherId || tutor._id} — new payment record (₹${VERIFICATION_FEE_AMOUNT}, ${paymentStatus})`);
      }
      created++;
    } catch (err: any) {
      console.error(`  FAIL  ${tutor.teacherId || tutor._id} —`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. Created/updated: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
