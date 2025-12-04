import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from '../models/User';
import Manager from '../models/Manager';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  // eslint-disable-next-line no-console
  console.error('[seedManagers] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log('[seedManagers] Connected to MongoDB');
}

async function createManager(index: number) {
  const email = `manager${index + 1}@test.com`;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const existingManager = await Manager.findOne({ user: existingUser._id });
    if (existingManager) {
      // eslint-disable-next-line no-console
      console.log(`[seedManagers] Manager already exists: ${email}`);
      return { user: existingUser, manager: existingManager };
    }

    const manager = await Manager.create({
      user: existingUser._id,
      classLeadsCreated: 0,
      demosScheduled: 0,
      classesConverted: 0,
      revenueGenerated: 0,
      tutorsVerified: 0,
      coordinatorsCreated: 0,
      paymentsProcessed: 0,
      isActive: true,
      joiningDate: faker.date.past({ years: 1 }),
    } as any);

    // eslint-disable-next-line no-console
    console.log(`[seedManagers] Attached Manager profile to existing user: ${email}`);
    return { user: existingUser, manager };
  }

  const user = await User.create({
    name: `Seed Manager ${index + 1}`,
    email,
    password: 'Password@123',
    role: USER_ROLES.MANAGER,
    phone: '+91' + faker.string.numeric(10),
    isActive: true,
  } as any);

  const manager = await Manager.create({
    user: user._id,
    classLeadsCreated: 0,
    demosScheduled: 0,
    classesConverted: 0,
    revenueGenerated: 0,
    tutorsVerified: 0,
    coordinatorsCreated: 0,
    paymentsProcessed: 0,
    isActive: true,
    joiningDate: faker.date.past({ years: 1 }),
  } as any);

  // eslint-disable-next-line no-console
  console.log(`[seedManagers] Created manager user: ${email}`);
  return { user, manager };
}

async function main() {
  await connect();

  const COUNT = 3; // number of managers to seed
  const results = [] as any[];

  for (let i = 0; i < COUNT; i++) {
    const res = await createManager(i);
    results.push(res);
  }

  // eslint-disable-next-line no-console
  console.log('[seedManagers] Done seeding managers:', results.map((r) => r.user.email));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error('[seedManagers] Failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
