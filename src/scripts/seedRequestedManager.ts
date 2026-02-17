
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Manager from '../models/Manager';
import { USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seed] Connected to MongoDB');
}

async function seedManagerProfile() {
  const email = 'manager@example.com';

  try {
    // 1. Find User (created in previous step)
    let user = await User.findOne({ email });
    if (!user) {
        console.log(`[seed] User ${email} not found. Creating...`);
        user = await User.create({
            name: 'Seed Manager',
            email,
            password: 'Password@123',
            role: USER_ROLES.MANAGER,
            phone: '+919876543210',
            isActive: true,
            city: 'Mumbai',
            acceptedTerms: true,
        } as any);
    }

    // 2. Create/Find Manager Profile
    const existingProfile = await Manager.findOne({ user: user._id });
    if (existingProfile) {
      console.log(`[seed] Manager profile for ${email} already exists.`);
    } else {
      await Manager.create({
        user: user._id,
        bio: 'Experienced Manager with 5 years in EdTech.',
        residentialAddress: '123, Tech Park, Mumbai',
        verificationStatus: 'VERIFIED',
        documents: [{
            documentType: 'AADHAAR',
            documentUrl: 'https://example.com/aadhaar.jpg',
            uploadedAt: new Date(),
            verifiedAt: new Date()
        }],
        permissions: {
            canViewSiteLeads: true,
            canVerifyTutors: true,
            canCreateLeads: true,
            canManagePayments: true
        }
      } as any);
      console.log(`[seed] Created Manager Profile for: ${email}`);
    }

    console.log('\n--- Manager Seeding Complete ---');
    console.log('Manager:     manager@example.com / Password@123');

  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

async function main() {
  try {
    await connect();
    await seedManagerProfile();
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}

main();
