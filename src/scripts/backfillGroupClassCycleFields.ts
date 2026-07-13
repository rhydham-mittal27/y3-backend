
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Groupleads from '../models/GroupClass';
import AttendanceSheet from '../models/AttendanceSheet';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[backfillGroupClassCycleFields] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[backfillGroupClassCycleFields] Error: ${error.message}`);
    process.exit(1);
  }
};

const backfill = async () => {
  await connectDB();

  try {
    const groups = await Groupleads.find({});
    console.log(`Found ${groups.length} group classes to backfill.`);

    let updatedCount = 0;
    let skipCount = 0;

    for (const group of groups) {
      try {
        const latestSheet = await AttendanceSheet.findOne({
          sheetType: 'GROUP',
          groupClass: group._id,
        }).sort({ cycleNumber: -1 });

        let currentCycleNumber = 1;
        let completedSessions = 0;

        if (latestSheet) {
          currentCycleNumber = latestSheet.cycleNumber || 1;
          completedSessions = latestSheet.totalSessionsTaken ?? (latestSheet.records?.length || 0);
        }

        console.log(
          `Group ${group._id} (${group.name}): before(currentCycleNumber=${group.currentCycleNumber}, completedSessions=${group.completedSessions}) -> after(currentCycleNumber=${currentCycleNumber}, completedSessions=${completedSessions})`
        );

        group.currentCycleNumber = currentCycleNumber;
        group.completedSessions = completedSessions;
        group.cycleStartPending = false;
        await group.save();
        updatedCount++;
      } catch (err: any) {
        console.error(`Error updating group class ${group._id}:`, err.message);
        skipCount++;
      }
    }

    console.log(`\nBackfill Summary:`);
    console.log(`Successfully updated: ${updatedCount}`);
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
