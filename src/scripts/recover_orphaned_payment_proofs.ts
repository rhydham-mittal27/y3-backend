import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client, S3_CONFIG } from '../config/s3';
import Tutor from '../models/Tutor';
import Payment from '../models/Payment';
import { PAYMENT_TYPE, PAYMENT_STATUS, VERIFICATION_FEE_AMOUNT } from '../config/constants';

const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '[DRY RUN — no writes]' : '[LIVE — will write to DB]');

  // List all objects under production/tutors/*/payments/
  const prefix = `${S3_CONFIG.FOLDER_PREFIX}/tutors/`;
  console.log(`Scanning S3 prefix: ${prefix}`);

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const obj of res.Contents ?? []) {
      const key = obj.Key ?? '';
      // Only care about files inside a /payments/ subfolder
      if (key.includes('/verification-fees/')) {
        keys.push(key);
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  console.log(`Found ${keys.length} payment proof file(s) on S3`);

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of keys) {
    // Path pattern: uploads/tutors/{userId}/verification-fees/{filename}
    const parts = key.split('/');
    const folderIndex = parts.indexOf('verification-fees');
    if (folderIndex < 1) continue;
    const userId = parts[folderIndex - 1];

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`  SKIP ${key} — userId segment "${userId}" is not a valid ObjectId`);
      skipped++;
      continue;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const tutor = await Tutor.findOne({ _id: userObjectId });

    if (!tutor) {
      console.log(`  SKIP ${key} — no tutor found for userId ${userId}`);
      skipped++;
      continue;
    }

    if (tutor.verificationFeePaymentProof) {
      console.log(`  SKIP ${tutor.teacherId || tutor._id} — already has verificationFeePaymentProof`);
      skipped++;
      continue;
    }

    console.log(`  RECOVER ${tutor.teacherId || tutor._id} (userId: ${userId}) ← ${key}`);

    if (!DRY_RUN) {
      try {
        const paymentStatus = tutor.verificationFeeStatus === 'PAID'
          ? PAYMENT_STATUS.PAID
          : PAYMENT_STATUS.PENDING;

        tutor.verificationFeePaymentProof = key;
        await tutor.save();

        // Also create/update payment record
        const existing = await Payment.findOne({
          tutor: userObjectId,
          paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
        });

        if (existing && !existing.paymentProof) {
          await Payment.updateOne({ _id: existing._id }, {
            $set: {
              amount: VERIFICATION_FEE_AMOUNT,
              status: paymentStatus,
              paymentProof: key,
              notes: 'Paid via screenshot (orphan-recovered)',
            },
          });
        } else if (!existing) {
          await Payment.create({
            tutor: userObjectId,
            amount: VERIFICATION_FEE_AMOUNT,
            currency: 'INR',
            status: paymentStatus,
            paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
            paymentProof: key,
            paymentDate: new Date(),
            dueDate: new Date(),
            notes: 'Paid via screenshot (orphan-recovered)',
            createdBy: userObjectId,
          });
        }

        recovered++;
      } catch (err: any) {
        console.error(`  FAIL ${tutor.teacherId || tutor._id} —`, err.message);
        failed++;
      }
    } else {
      recovered++;
    }
  }

  console.log(`\nDone. Recovered: ${recovered}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(err => { console.error(err); process.exit(1); });
