import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import Payment from '../models/Payment';

const EMAIL = 'rhydham9@gmail.com';
const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function main() {
  if (!uri) { console.error('Missing MONGODB_URI/DATABASE_URL in .env'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const user = await User.findOne({ email: { $regex: new RegExp(`^${EMAIL}$`, 'i') } });
  if (!user) { console.error(`No user found for ${EMAIL}`); process.exit(1); }
  console.log(`User: ${user._id} (${user.email})`);

  const tutor = await Tutor.findOne({ user: user._id });
  if (!tutor) { console.error('No tutor found for this user'); process.exit(1); }
  console.log(`Tutor: ${tutor._id}, verificationStatus=${tutor.verificationStatus}, feeStatus=${tutor.verificationFeeStatus}`);

  // Reset verification fields
  tutor.verificationStatus = 'PENDING';
  tutor.verificationFeeStatus = undefined as any;
  tutor.verificationFeePaymentProof = undefined as any;
  tutor.verificationFeePaymentDate = undefined as any;
  tutor.verifiedAt = undefined as any;
  tutor.verifiedBy = undefined as any;
  tutor.verificationNotes = undefined as any;
  tutor.verificationRejectionReason = undefined as any;
  tutor.documents = (tutor.documents ?? []).filter(
    (d: any) => String(d.documentType).toUpperCase() === 'PROFILE_PHOTO'
  );

  await tutor.save();
  console.log('Tutor verification fields reset.');

  // Delete all payment records for this tutor
  const deleted = await Payment.deleteMany({ tutor: user._id });
  console.log(`Deleted ${deleted.deletedCount} payment record(s).`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
