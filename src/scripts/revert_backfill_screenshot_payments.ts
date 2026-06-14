import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Payment from '../models/Payment';
import { PAYMENT_TYPE, PAYMENT_STATUS, VERIFICATION_FEE_DEDUCT_AMOUNT } from '../config/constants';

/**
 * Reverts backfill_screenshot_payments.ts.
 *
 * The backfill stamped every record it touched with "(backfilled)" in notes.
 *
 * Two cases:
 *  - CREATED by backfill  → delete the record entirely
 *  - UPDATED by backfill  → restore to original DEDUCT values (₹700, PENDING, no proof)
 *
 * How we tell them apart:
 *  - CREATED records have `createdAt` within the backfill run window AND
 *    notes that contain "(backfilled)".
 *  - UPDATED records are older records (createdAt before backfill) whose
 *    notes were changed to contain "(backfilled)" but whose createdAt is
 *    much older — meaning they originally existed as DEDUCT records.
 *
 * Safe fallback: if we can't tell, we DELETE the record. The tutor's
 * verificationFeeStatus on the Tutor doc is unaffected by the backfill,
 * so they can re-trigger the DEDUCT flow if needed.
 */

// ── Set this to the timestamp just BEFORE you ran the backfill ───────────────
// e.g. if you ran backfill on 2026-06-14 at 15:00 UTC, set this to that time.
// Records created AFTER this time with (backfilled) notes = created by backfill → DELETE
// Records created BEFORE this time with (backfilled) notes = updated by backfill → RESTORE
const BACKFILL_RAN_AT = new Date('2026-06-14T00:00:00.000Z'); // ← adjust if needed

const revert = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to MongoDB');

  const backfilledPayments = await Payment.find({
    paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
    notes: { $regex: '\\(backfilled\\)', $options: 'i' },
  }).select('_id tutor amount status notes createdAt paymentProof');

  console.log(`Found ${backfilledPayments.length} backfilled payment records`);

  let deleted = 0;
  let restored = 0;
  let failed = 0;

  for (const payment of backfilledPayments) {
    try {
      const wasCreatedByBackfill = payment.createdAt >= BACKFILL_RAN_AT;

      if (wasCreatedByBackfill) {
        // Record didn't exist before backfill — delete it
        await Payment.deleteOne({ _id: payment._id });
        console.log(`  DELETE ${payment._id} (tutor: ${payment.tutor}) — created by backfill`);
        deleted++;
      } else {
        // Record existed before (was a DEDUCT record) — restore original DEDUCT values
        await Payment.updateOne(
          { _id: payment._id },
          {
            $set: {
              amount: VERIFICATION_FEE_DEDUCT_AMOUNT,
              status: PAYMENT_STATUS.PENDING,
              notes: 'Deduct from first payout',
            },
            $unset: {
              paymentProof: '',
              paymentDate: '',
            },
          }
        );
        console.log(`  RESTORE ${payment._id} (tutor: ${payment.tutor}) — reverted to DEDUCT ₹${VERIFICATION_FEE_DEDUCT_AMOUNT}`);
        restored++;
      }
    } catch (err: any) {
      console.error(`  FAIL ${payment._id} —`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. Deleted: ${deleted}, Restored to DEDUCT: ${restored}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

revert().catch((err) => {
  console.error('Revert failed:', err);
  process.exit(1);
});
