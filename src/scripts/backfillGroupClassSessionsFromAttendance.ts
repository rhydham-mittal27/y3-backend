
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Groupleads from '../models/GroupClass';
import AttendanceSheet from '../models/AttendanceSheet';
import ClassSession from '../models/ClassSession';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[backfillGroupClassSessionsFromAttendance] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[backfillGroupClassSessionsFromAttendance] Error: ${error.message}`);
    process.exit(1);
  }
};

const startOfDay = (d: Date) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

const backfill = async () => {
  await connectDB();

  try {
    const groups = await Groupleads.find({});
    console.log(`Found ${groups.length} group classes to check.`);

    let sessionsCreated = 0;
    let sessionsSkipped = 0;
    let sheetsProcessed = 0;

    for (const group of groups) {
      const sheets = await AttendanceSheet.find({
        sheetType: 'GROUP',
        groupClass: group._id,
      }).sort({ cycleNumber: 1 });

      if (!sheets.length) continue;

      for (const sheet of sheets) {
        sheetsProcessed++;

        for (let i = 0; i < sheet.records.length; i++) {
          const record: any = sheet.records[i];
          const sessionNumber = i + 1;
          const sessionDate = startOfDay(new Date(record.sessionDate));

          try {
            const existing = await ClassSession.findOne({
              groupClass: group._id,
              cycleNumber: sheet.cycleNumber,
              sessionNumber,
            }).select('_id');

            if (existing) {
              sessionsSkipped++;
              continue;
            }

            await ClassSession.create({
              groupClass: group._id,
              cycleNumber: sheet.cycleNumber,
              sessionNumber,
              sessionDate,
              timeSlot: group.schedule?.timeSlot || 'N/A',
              cycleMonth: sessionDate.getMonth() + 1,
              cycleYear: sessionDate.getFullYear(),
              tutor: record.tutor || group.tutor,
              status: 'COMPLETED',
            });
            sessionsCreated++;
          } catch (err: any) {
            console.error(
              `Error creating session for group ${group._id} cycle ${sheet.cycleNumber} session ${sessionNumber}:`,
              err.message,
            );
          }
        }
      }

      console.log(`Group ${group._id} (${group.name}): processed ${sheets.length} sheet(s)`);
    }

    console.log(`\nBackfill Summary:`);
    console.log(`Attendance sheets processed: ${sheetsProcessed}`);
    console.log(`ClassSession docs created: ${sessionsCreated}`);
    console.log(`ClassSession docs already existing (skipped): ${sessionsSkipped}`);
    console.log('✅ Backfill completed successfully');
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

backfill();
