import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedAdmin] Connected to MongoDB');
}

async function main() {
  await connect();

  const email = 'adminseed@gmail.com';
  const password = 'Password@123';

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    console.log('[seedAdmin] Admin user already exists:', email);
  } else {
    const admin = await User.create({
      name: 'Seed Admin',
      email,
      password,
      role: USER_ROLES.ADMIN,
      phone: '+919000000000',
      isActive: true,
    } as any);
    console.log('[seedAdmin] Created admin user:', admin.email);
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedAdmin] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
