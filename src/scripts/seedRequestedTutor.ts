
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import { USER_ROLES, VERIFICATION_STATUS, TEACHING_MODE } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seed] Connected to MongoDB');
}

async function seedTutor() {
  const email = 'tutor@example.com';
  const role = USER_ROLES.TUTOR;

  try {
    // 1. Create/Find User
    let user = await User.findOne({ email });
    if (user) {
      console.log(`[seed] User ${email} already exists.`);
    } else {
      user = await User.create({
        name: 'Seed Tutor',
        email,
        password: 'Password@123',
        role,
        phone: '+919999999999',
        isActive: true,
        city: 'Delhi',
        acceptedTerms: true,
      } as any);
      console.log(`[seed] Created User: ${email}`);
    }

    // 2. Create/Find Tutor Profile
    const existingProfile = await Tutor.findOne({ user: user._id });
    if (existingProfile) {
      console.log(`[seed] Tutor profile for ${email} already exists.`);
    } else {
      await Tutor.create({
        user: user._id,
        teacherId: 'T-SEED-001',
        subjects: ['Maths', 'Physics', 'Science'],
        experienceHours: 100,
        qualifications: ['B.Sc', 'B.Ed'],
        introVideoUrl: 'https://example.com/demo.mp4',
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        isAvailable: true,
        city: 'Delhi',
        preferredMode: TEACHING_MODE.ONLINE,
        rating: 4.5,
      } as any);
      console.log(`[seed] Created Tutor Profile for: ${email}`);
    }

    console.log('\n--- Tutor Seeding Complete ---');
    console.log('Tutor:       tutor@example.com / Password@123');

  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

async function main() {
  try {
    await connect();
    await seedTutor();
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}

main();
