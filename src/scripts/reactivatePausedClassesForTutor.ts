
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import User from '../models/User';
import FinalClass from '../models/FinalClass';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Scope: only reactivate PAUSED classes belonging to this specific tutor.
// Not a general-purpose "unpause everyone" script on purpose.
const TARGET_TUTOR_NAME = 'Janhvi Lodhi';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[reactivatePausedClassesForTutor] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[reactivatePausedClassesForTutor] Error: ${error.message}`);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();

  try {
    const tutorUser = await User.findOne({ name: { $regex: new RegExp(`^${TARGET_TUTOR_NAME}$`, 'i') } });
    if (!tutorUser) {
      console.log(`No user found matching tutor name "${TARGET_TUTOR_NAME}". Nothing to do.`);
      return;
    }
    console.log(`Tutor: ${tutorUser.name} (${tutorUser._id})`);

    const pausedClasses = await FinalClass.find({ tutor: tutorUser._id, status: 'PAUSED' });
    console.log(`Found ${pausedClasses.length} PAUSED class(es) for this tutor.`);

    if (pausedClasses.length === 0) {
      console.log('Nothing to reactivate.');
      return;
    }

    // Backup before mutating anything
    const outDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `reactivate-janhvi-lodhi-classes-backup-${ts}.json`);
    fs.writeFileSync(outFile, JSON.stringify(pausedClasses, null, 2));
    console.log(`Backed up ${pausedClasses.length} class doc(s) to ${outFile}`);

    let updatedCount = 0;
    for (const cls of pausedClasses) {
      console.log(`Class ${cls._id} (${cls.className}) status: ${cls.status} -> ACTIVE`);
      cls.status = 'ACTIVE' as any;
      await cls.save();
      updatedCount++;
    }

    console.log(`\nReactivation Summary:`);
    console.log(`Successfully reactivated: ${updatedCount}`);
    console.log('✅ Done');
  } catch (error) {
    console.error('Error during reactivation:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

run();
