// backend/scripts/backfillTutorMonthlyStats.ts

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Tutor from '../models/Tutor';
import { computeTutorMonthlyStats } from '../services/finalClassService';

dotenv.config();

// Adjust this env var name / value to match your project
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-final';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const tutors = await Tutor.find({});
    console.log(`Found ${tutors.length} tutors. Updating monthlyStats...`);

    for (const tutor of tutors) {
      const tutorUserId = String(tutor.user);
      try {
        const stats = await computeTutorMonthlyStats(tutorUserId);
        await Tutor.updateOne(
          { _id: tutor._id },
          { $set: { monthlyStats: stats } }
        );
        console.log(
          `Updated tutor ${tutor._id} (user=${tutorUserId}) ->`,
          stats
        );
      } catch (e) {
        console.error(
          `Failed to update monthlyStats for tutor ${tutor._id} (user=${tutorUserId})`,
          e
        );
      }
    }

    console.log('Done updating monthlyStats for all tutors.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error in backfill script:', err);
    process.exit(1);
  }
}

main();