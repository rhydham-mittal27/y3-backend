
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Tutor from '../models/Tutor';
import Option from '../models/Option';
import { generateTeacherIdWithCityCode } from '../utils/generateTeacherId';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[backfillTeacherIds] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[backfillTeacherIds] Error: ${error.message}`);
    process.exit(1);
  }
};

const backfill = async () => {
  await connectDB();

  try {
    const tutorsWithoutId = await Tutor.find({
      $or: [
        { teacherId: { $exists: false } },
        { teacherId: null },
        { teacherId: '' }
      ]
    }).populate('user');

    console.log(`Found ${tutorsWithoutId.length} tutors without teacherId.`);

    let successCount = 0;
    let skipCount = 0;

    // Cache for city codes to avoid redundant DB lookups
    const cityCodeCache = new Map<string, string>();

    for (const tutor of tutorsWithoutId) {
      try {
        const user = tutor.user as any;
        if (!user) {
          console.warn(`Skipping tutor ${tutor._id} - associated user not found.`);
          skipCount++;
          continue;
        }

        const cityName = user.city || 'Bhopal'; // Default to Bhopal if not set
        let cityCode = cityCodeCache.get(cityName.toUpperCase());

        if (!cityCode) {
          // Look up city option to get cityCode from metadata
          const cityOption = await Option.findOne({
            type: 'CITY',
            $or: [
              { label: new RegExp(`^${cityName}$`, 'i') },
              { value: cityName.toUpperCase() }
            ]
          });

          if (cityOption && cityOption.metadata && typeof cityOption.metadata.cityCode === 'string') {
            cityCode = cityOption.metadata.cityCode;
            cityCodeCache.set(cityName.toUpperCase(), cityCode);
          } else {
            console.warn(`City code not found for ${cityName}. Using fallback.`);
            cityCode = cityName.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
          }
        }

        const teacherId = generateTeacherIdWithCityCode(user.gender, cityCode, cityName);

        // Check for collision (rare but possible with random string)
        let isUnique = false;
        let finalTeacherId = teacherId;
        let attempts = 0;
        
        while (!isUnique && attempts < 5) {
          const existing = await Tutor.findOne({ teacherId: finalTeacherId });
          if (!existing) {
            isUnique = true;
          } else {
            finalTeacherId = generateTeacherIdWithCityCode(user.gender, cityCode, cityName);
            attempts++;
          }
        }

        tutor.teacherId = finalTeacherId;
        await tutor.save();
        successCount++;

        if (successCount % 20 === 0) {
          console.log(`Updated ${successCount} tutors...`);
        }
      } catch (err: any) {
        console.error(`Error updating tutor ${tutor._id}:`, err.message);
        skipCount++;
      }
    }

    console.log(`\nBackfill Summary:`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Skipped: ${skipCount}`);
    console.log('✅ Backfill completed successfully');
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

backfill();
