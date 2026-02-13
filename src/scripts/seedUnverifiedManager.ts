import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User';
import Manager from '../models/Manager';

dotenv.config();

const seedUnverifiedManager = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
    if (!uri) throw new Error('Missing MONGODB_URI or DATABASE_URL');
    await mongoose.connect(uri);
    console.log('MongoDB Connected');

    const email = 'unverified.manager3@example.com';
    const password = 'password123';

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
        console.log('User already exists, updating...');
        user.isActive = true;
        // user.password = password; // Should hash if updating, but simpler to skip or delete/recreate
    } else {
        user = await User.create({
            name: 'Unverified Manager 3',
            email,
            password,
            role: 'MANAGER',
            isActive: true,
            acceptedTerms: false,
            devices: [],
        });
        console.log('User created');
    }

    // Check if manager profile exists
    let manager = await Manager.findOne({ user: user._id });
    if (manager) {
        manager.verificationStatus = 'PENDING';
        await manager.save();
        console.log('Manager profile updated to PENDING');
    } else {
        manager = await Manager.create({
            user: user._id,
            verificationStatus: 'PENDING',
            joiningDate: new Date(),
            classLeadsCreated: 0,
            demosScheduled: 0,
            classesConverted: 0,
            revenueGenerated: 0,
            documents: [],
        });
        console.log('Manager profile created with PENDING status');
    }

    console.log('-----------------------------------');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('-----------------------------------');

    process.exit();
  } catch (error) {
    console.error('Error seeding unverified manager:', error);
    process.exit(1);
  }
};

seedUnverifiedManager();
