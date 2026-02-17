
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seed] Connected to MongoDB');
}

async function seedUser(name: string, email: string, role: string, city?: string) {
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] User ${email} (${role}) already exists.`);
    return existing;
  }

  const user = await User.create({
    name,
    email,
    password: 'Password@123',
    role,
    phone: '+919000000000',
    isActive: true,
    city: city || 'Delhi',
    acceptedTerms: true,
  } as any);
  console.log(`[seed] Created ${role}: ${email} / Password@123`);
  return user;
}

async function main() {
  try {
    await connect();

    await seedUser('Seed Admin', 'admin@example.com', USER_ROLES.ADMIN);
    await seedUser('Seed Manager', 'manager@example.com', USER_ROLES.MANAGER, 'Mumbai');
    await seedUser('Seed Coordinator', 'coordinator@example.com', USER_ROLES.COORDINATOR, 'Bangalore');

    console.log('\n--- Seeding Complete ---');
    console.log('Admin:       admin@example.com / Password@123');
    console.log('Manager:     manager@example.com / Password@123');
    console.log('Coordinator: coordinator@example.com / Password@123');

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

main();
