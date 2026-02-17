import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Coordinator from '../models/Coordinator';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/ys-final';

async function connect() {
  await mongoose.connect(uri);
  console.log('[seedRequestedCoordinator] Connected to MongoDB');
}

async function main() {
  await connect();

  const email = 'coordinator.pro@test.com';
  const name = 'Professional Coordinator';

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    console.log(`[seedRequestedCoordinator] User already exists: ${email}`);
    let coordinator = await Coordinator.findOne({ user: existingUser._id });
    if (!coordinator) {
      await Coordinator.create({
        user: existingUser._id,
        maxClassCapacity: 15,
        specialization: ['English', 'Soft Skills'],
        isActive: true,
      } as any);
      console.log('[seedRequestedCoordinator] Created missing Coordinator profile for existing user.');
    } else {
      console.log('[seedRequestedCoordinator] Coordinator profile already exists.');
    }
    return;
  }

  const user = await User.create({
    name,
    email,
    password: 'Password@123',
    role: USER_ROLES.COORDINATOR,
    phone: '+919876543210',
    isActive: true,
    acceptedTerms: true,
  } as any);

  await Coordinator.create({
    user: user._id,
    maxClassCapacity: 15,
    specialization: ['English', 'Soft Skills'],
    isActive: true,
    performanceScore: 90,
  } as any);

  console.log(`[seedRequestedCoordinator] Successfully created coordinator: ${email}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedRequestedCoordinator] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
