import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AttendanceSheet from '../models/AttendanceSheet';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    const targetId = new mongoose.Types.ObjectId('69d67d7f1b69e297b2bdcbd6');
    const sourceIds = [
      '69d7bb011b69e297b2bdd9e4',
      '69dcf4f01b69e297b2bdec7c',
      '69e28da51b69e297b2be1f02'
    ].map(id => new mongoose.Types.ObjectId(id));

    const allSheets = await AttendanceSheet.find({
      _id: { $in: [targetId, ...sourceIds] }
    });

    if (allSheets.length === 0) {
      console.log('No sheets found matching the IDs.');
      process.exit(0);
    }

    const masterRecords: any[] = [];
    const seenDates = new Set<string>();

    allSheets.forEach(s => {
      (s.records || []).forEach((r: any) => {
        const dStr = new Date(r.sessionDate).toDateString();
        if (!seenDates.has(dStr)) {
          seenDates.add(dStr);
          masterRecords.push(r.toObject ? r.toObject() : r);
        } else {
          console.log(`Duplicate record for date ${dStr} found in sheet ${s._id}, skipping.`);
        }
      });
    });

    masterRecords.sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());

    const presentCount = masterRecords.filter(r => 
        r.studentAttendanceStatus === 'PRESENT' || 
        r.studentAttendanceStatus === 'NATIONAL_HOLIDAY'
    ).length;
    const absentCount = masterRecords.filter(r => r.studentAttendanceStatus === 'ABSENT').length;

    console.log(`Consolidating ${masterRecords.length} unique records into Cycle 1...`);

    await AttendanceSheet.updateOne(
      { _id: targetId },
      {
        $set: {
          records: masterRecords,
          totalSessionsTaken: masterRecords.length,
          presentCount,
          absentCount
        }
      }
    );

    const deleteResult = await AttendanceSheet.deleteMany({
      _id: { $in: sourceIds }
    });

    console.log(`Consolidation complete.`);
    console.log(`Sheet updated: ${targetId}`);
    console.log(`Redundant sheets deleted: ${deleteResult.deletedCount}`);

  } catch (error) {
    console.error('Error during consolidation:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
