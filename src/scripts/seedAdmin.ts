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

  const email = String(process.env.ADMIN_SEED_EMAIL || 'adminseed@gmail.com').toLowerCase().trim();
  const password = String(process.env.ADMIN_SEED_PASSWORD || 'Password@123');
  const name = String(process.env.ADMIN_SEED_NAME || 'Seed Admin');
  const phone = String(process.env.ADMIN_SEED_PHONE || '+919000000000');
  const updatePassword = String(process.env.ADMIN_SEED_UPDATE_PASSWORD || '').toLowerCase() === 'true';

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    const update: any = {
      role: USER_ROLES.ADMIN,
      isActive: true,
    };
    if (!existing.name && name) update.name = name;
    if (!existing.phone && phone) update.phone = phone;
    if (updatePassword) update.password = password;

    await User.updateOne({ _id: existing._id }, { $set: update });
    console.log('[seedAdmin] Admin user already exists:', email);
  } else {
    const admin = await User.create({
      name,
      email,
      password,
      role: USER_ROLES.ADMIN,
      phone,
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
