/**
 * seedOneParent.ts — creates ONE parent account directly in whatever
 * MONGODB_URI points to (main-db by default, from .env).
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/seedOneParent.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { registerParentUser } from '../services/parentService';
import { markEmailVerifiedForSeeding } from '../services/authService';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(`Connected to: ${mongoose.connection.name}`);

  const stamp = Date.now();
  const email = `test.parent.${stamp}@yourshikshak.test`;

  // Parent registration now requires the same OTP verification the app's
  // VerifyEmailOtpScreen enforces; bypass the round-trip here since this
  // script creates accounts directly rather than through the app.
  markEmailVerifiedForSeeding(email);

  const result = await registerParentUser({
    name: 'TEST Parent',
    email,
    password: 'Password@123',
    phone: '+919999900004',
    city: 'Test City',
    primaryStudentName: 'TEST Student',
    primaryStudentGrade: '9',
    notes: 'Seeded via seedOneParent.ts',
    source: 'MOBILE_APP',
  } as any);

  console.log('\n─────────────────────────────────────────────');
  console.log('Parent created:');
  console.log('  email    :', result.user.email);
  console.log('  password : Password@123');
  console.log('  userId   :', result.user.id);
  console.log('─────────────────────────────────────────────');
}

run()
  .then(() => { console.log('\nDone.'); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
