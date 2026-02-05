import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import { USER_ROLES, TEACHING_MODE, VERIFICATION_STATUS } from '../config/constants';

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) {
    throw new Error('MONGO_URI (or DATABASE_URL) is not set in environment');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function upsertUser(name: string, email: string, role: string, phone?: string) {
  const existing = await User.findOne({ email });
  if (existing) {
    existing.acceptedTerms = false; // Ensure TnC isn't accepted for testing
    await existing.save();
    return existing;
  }
  const user = new User({ 
    name, 
    email, 
    password: 'Password@123', 
    role, 
    phone,
    acceptedTerms: false 
  });
  await user.save();
  return user;
}

async function seedOfflineTutor() {
  await connect();

  try {
    const email = 'offline.tutor@example.com';
    const tutorUser = await upsertUser('Offline Tutor', email, USER_ROLES.TUTOR, '+919988776655');

    // Ensure tutor profile exists with OFFLINE mode
    let tutorProfile = await Tutor.findOne({ user: tutorUser._id });
    if (tutorProfile) {
      tutorProfile.preferredMode = TEACHING_MODE.OFFLINE;
      tutorProfile.whatsappCommunityJoined = false;
      await tutorProfile.save();
    } else {
      tutorProfile = await Tutor.create({
        user: tutorUser._id,
        experienceHours: 45,
        subjects: ['History', 'Geography'],
        qualifications: ['B.A'],
        preferredMode: TEACHING_MODE.OFFLINE,
        preferredLocations: ['Bhopal Central'],
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        ratings: 4.8,
        totalRatings: 10,
        isAvailable: true,
        tier: 'BRONZE',
        whatsappCommunityJoined: false
      });
    }

    console.log('Successfully seeded/updated offline tutor for testing:');
    console.log({
      email: tutorUser.email,
      password: 'Password@123',
      preferredMode: tutorProfile.preferredMode,
      acceptedTerms: tutorUser.acceptedTerms
    });
    console.log('\nLogin with these credentials to see the WhatsApp Community popup.');

  } finally {
    await mongoose.disconnect();
  }
}

seedOfflineTutor().catch((err) => {
  console.error('Seed offline tutor failed', err);
  process.exit(1);
});
