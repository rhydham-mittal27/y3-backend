import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected');

  const db = mongoose.connection.db!;

  const count = await db.collection('tutors').countDocuments({
    verificationFeePaymentProof: { $exists: true, $nin: [null, ''] },
  });
  console.log('Tutors with verificationFeePaymentProof:', count);

  const sample = await db.collection('tutors').findOne({
    verificationFeePaymentProof: { $exists: true, $nin: [null, ''] },
  });

  if (sample) {
    console.log('verificationFeeStatus:', sample.verificationFeeStatus);
    console.log('verificationFeePaymentProof:', String(sample.verificationFeePaymentProof).substring(0, 80));
  } else {
    // No match — show a tutor doc to see actual field names
    const any = await db.collection('tutors').findOne({});
    console.log('No tutors with proof found. Sample tutor keys:', any ? Object.keys(any).join(', ') : 'no tutors at all');

    // Also check if there's any fee-related field with a different name
    const withAnyProof = await db.collection('tutors').findOne({
      $or: [
        { feePaymentProof: { $exists: true } },
        { paymentProof: { $exists: true } },
        { verificationProof: { $exists: true } },
        { screenshotUrl: { $exists: true } },
      ],
    });
    if (withAnyProof) {
      console.log('Found tutor with alternate proof field:', Object.keys(withAnyProof).filter(k => k.toLowerCase().includes('proof') || k.toLowerCase().includes('screenshot') || k.toLowerCase().includes('fee')));
    }
  }

  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
