import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from '../models/User';
import Coordinator from '../models/Coordinator';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  // eslint-disable-next-line no-console
  console.error('[seedCoordinators] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log('[seedCoordinators] Connected to MongoDB');
}

async function createCoordinator(index: number) {
  const email = `coordinator${index + 1}@test.com`;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const existingCoordinator = await Coordinator.findOne({ user: existingUser._id });
    if (existingCoordinator) {
      // eslint-disable-next-line no-console
      console.log(`[seedCoordinators] Coordinator already exists: ${email}`);
      return { user: existingUser, coordinator: existingCoordinator };
    }

    const coordinator = await Coordinator.create({
      user: existingUser._id,
      assignedClasses: [],
      maxClassCapacity: 10,
      activeClassesCount: 0,
      totalClassesHandled: 0,
      specialization: ['Math', 'Science'],
      joiningDate: faker.date.past({ years: 1 }),
      performanceScore: faker.number.int({ min: 60, max: 95 }),
      isActive: true,
    } as any);

    // eslint-disable-next-line no-console
    console.log(`[seedCoordinators] Attached Coordinator profile to existing user: ${email}`);
    return { user: existingUser, coordinator };
  }

  const user = await User.create({
    name: `Seed Coordinator ${index + 1}`,
    email,
    password: 'Password@123',
    role: USER_ROLES.COORDINATOR,
    phone: '+91' + faker.string.numeric(10),
    isActive: true,
  } as any);

  const coordinator = await Coordinator.create({
    user: user._id,
    assignedClasses: [],
    maxClassCapacity: 10,
    activeClassesCount: 0,
    totalClassesHandled: 0,
    specialization: ['Math', 'Science'],
    joiningDate: faker.date.past({ years: 1 }),
    performanceScore: faker.number.int({ min: 60, max: 95 }),
    isActive: true,
  } as any);

  // eslint-disable-next-line no-console
  console.log(`[seedCoordinators] Created coordinator user: ${email}`);
  return { user, coordinator };
}

async function main() {
  await connect();

  const COUNT = 5; // number of coordinators to seed
  const results: Array<{ user: any; coordinator: any }> = [];

  for (let i = 0; i < COUNT; i++) {
    const res = await createCoordinator(i);
    results.push(res);
  }

  // eslint-disable-next-line no-console
  console.log('[seedCoordinators] Done seeding coordinators:', results.map((r) => r.user.email));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error('[seedCoordinators] Failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
