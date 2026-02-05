import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Option from '../models/Option';
import Tutor from '../models/Tutor';
import Coordinator from '../models/Coordinator';
import { USER_ROLES, VERIFICATION_STATUS, TUTOR_TIER } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedE2E] Connected to MongoDB');
}

async function createOrUpdateOption(data: any) {
  const existing = await Option.findOne({ type: data.type, value: data.value });
  if (existing) {
    existing.label = data.label;
    existing.isActive = true;
    if (data.parent) {
      existing.parent = data.parent;
    }
    await existing.save();
    return existing;
  }
  return await Option.create({ ...data, isActive: true });
}

async function createOrUpdateUser(data: any) {
  const existing = await User.findOne({ email: data.email });
  let user;
  if (existing) {
    console.log(`[seedE2E] User already exists: ${data.email}. Updating...`);
    existing.isActive = true;
    existing.acceptedTerms = true;
    await existing.save();
    user = existing;
  } else {
    user = await User.create({
      ...data,
      isActive: true,
      acceptedTerms: true,
    });
    console.log(`[seedE2E] Created user: ${data.email} (${data.role})`);
  }

  // Handle specific roles
  if (user.role === USER_ROLES.TUTOR) {
    const existingTutor = await Tutor.findOne({ user: user._id });
    if (!existingTutor) {
      await Tutor.create({
        user: user._id,
        subjects: ['Mathematics'],
        experienceHours: 0,
        verificationStatus: VERIFICATION_STATUS.VERIFIED,
        tier: TUTOR_TIER.BRONZE,
        isAvailable: true,
      });
      console.log(`[seedE2E] Created Tutor profile for: ${user.email}`);
    }
  } else if (user.role === USER_ROLES.COORDINATOR) {
    const existingCoordinator = await Coordinator.findOne({ user: user._id });
    if (!existingCoordinator) {
      await Coordinator.create({
        user: user._id,
        isActive: true,
      });
      console.log(`[seedE2E] Created Coordinator profile for: ${user.email}`);
    }
  }

  return user;
}

async function main() {
  await connect();

  // Seed Options
  const board = await createOrUpdateOption({ type: 'BOARD', label: 'CBSE', value: 'CBSE' });
  const grade = await createOrUpdateOption({ 
    type: 'GRADE', 
    label: 'class_1', 
    value: 'class_1', 
    parent: board._id 
  });
  await createOrUpdateOption({ 
    type: 'SUBJECT', 
    label: 'Mathematics', 
    value: 'Mathematics', 
    parent: grade._id 
  });
  await createOrUpdateOption({ type: 'CITY', label: 'Mumbai', value: 'Mumbai' });
  await createOrUpdateOption({ type: 'AREA', label: 'Bandra', value: 'Bandra' });

  const users = [
    { name: 'E2E Admin', email: 'admin@test.com', password: 'Password@123', role: USER_ROLES.ADMIN },
    { name: 'E2E Coordinator', email: 'coordinator@test.com', password: 'Password@123', role: USER_ROLES.COORDINATOR },
    { name: 'E2E Tutor', email: 'tutor@test.com', password: 'Password@123', role: USER_ROLES.TUTOR },
    { name: 'E2E Parent', email: 'parent@test.com', password: 'Password@123', role: USER_ROLES.PARENT },
  ];

  // Seed Users
  for (const userData of users) {
    await createOrUpdateUser(userData);
  }

  console.log('[seedE2E] Seeding completed.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedE2E] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
