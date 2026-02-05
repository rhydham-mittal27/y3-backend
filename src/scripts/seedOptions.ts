
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';
import {
  BOARD_TYPE,
  TEACHING_MODE,
  LEAD_SOURCE,
  PREFERRED_TUTOR_GENDER,
  TUTOR_TIER,
  DOCUMENT_TYPES,
  PAYMENT_STATUS,
  VERIFICATION_STATUS,
  EXTRACURRICULAR_ACTIVITY,
} from '../config/constants';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedOptions = async () => {
  await connectDB();

  const optionsToSeed = [
    { type: 'BOARD', values: Object.values(BOARD_TYPE) },
    { type: 'TEACHING_MODE', values: Object.values(TEACHING_MODE) },
    { type: 'LEAD_SOURCE', values: Object.values(LEAD_SOURCE) },
    { type: 'GENDER', values: Object.values(PREFERRED_TUTOR_GENDER) },
    { type: 'TUTOR_TIER', values: Object.values(TUTOR_TIER) },
    { type: 'DOCUMENT_TYPE', values: Object.values(DOCUMENT_TYPES) },
    { type: 'PAYMENT_STATUS', values: Object.values(PAYMENT_STATUS) },
    { type: 'VERIFICATION_STATUS', values: Object.values(VERIFICATION_STATUS) },
    { type: 'EXTRACURRICULAR_ACTIVITY', values: Object.values(EXTRACURRICULAR_ACTIVITY) },
  ];

  try {
    for (const group of optionsToSeed) {
      console.log(`Seeding ${group.type}...`);
      for (const value of group.values) {
        // Create a human-readable label: replace underscores with spaces and title case
        const label = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        
        await Option.findOneAndUpdate(
          { type: group.type, value: value },
          {
            type: group.type,
            value: value,
            label: label,
            isActive: true,
            sortOrder: 0
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log('✅ Options seeded successfully');
  } catch (error) {
    console.error('Error seeding options:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

seedOptions();
