import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import User from '../models/User';
import Tutor from '../models/Tutor';

// One-off cleanup: removes only the disposable Playwright test tutor account
// created during manual regression testing of the edit-profile fix.
// Scoped by exact email match on purpose.
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TARGET_EMAIL = 'pwtest1784055174@example.com';
const TARGET_TEACHER_ID = 'TMBPL6W1D4W';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[deletePlaywrightTestTutor] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[deletePlaywrightTestTutor] Error: ${error.message}`);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  try {
    const user = await User.findOne({ email: TARGET_EMAIL });
    if (!user) {
      console.log(`No user found with email "${TARGET_EMAIL}". Nothing to do.`);
      return;
    }

    const tutor = await Tutor.findOne({ user: user._id });
    if (tutor && tutor.teacherId !== TARGET_TEACHER_ID) {
      console.log(`SAFETY ABORT: found tutor doc but teacherId "${tutor.teacherId}" does not match expected "${TARGET_TEACHER_ID}". Not deleting.`);
      return;
    }

    const outDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `delete-playwright-test-tutor-backup-${ts}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ user, tutor }, null, 2));
    console.log(`Backed up user + tutor doc(s) to ${outFile}`);

    if (tutor) {
      await Tutor.deleteOne({ _id: tutor._id });
      console.log(`Deleted Tutor doc ${tutor._id} (teacherId ${tutor.teacherId})`);
    }
    await User.deleteOne({ _id: user._id });
    console.log(`Deleted User doc ${user._id} (${user.email})`);

    console.log('\n✅ Cleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

run();
