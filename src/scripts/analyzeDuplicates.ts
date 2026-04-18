import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import AttendanceSheet from '../models/AttendanceSheet';
import Payment from '../models/Payment';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/yourshikshak';
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

const analyzeDuplicates = async () => {
  await connectDB();

  console.log('Analyzing Attendance Sheets for duplicates...');

  // Group by class and cycleNumber, finding those with more than 1 PENDING sheet
  const duplicates = await AttendanceSheet.aggregate([
    {
      $match: { status: 'PENDING' }
    },
    {
      $group: {
        _id: {
          finalClass: '$finalClass',
          groupClass: '$groupClass',
          cycleNumber: '$cycleNumber'
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        recordsCount: { $push: { id: '$_id', count: { $size: '$records' } } }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]);

  console.log(`Found ${duplicates.length} groups of duplicate sheets.`);

  let totalSheetsToRemove = 0;
  let totalPaymentsToRemove = 0;

  for (const group of duplicates) {
    console.log(`\nGroup: Class=${group._id.finalClass || group._id.groupClass}, Cycle=${group._id.cycleNumber}`);
    console.log(`- Sheets: ${group.count}`);
    
    // Sort sheets by number of records descending to keep the one with most data
    const sheetsInfo = group.recordsCount.sort((a: any, b: any) => b.count - a.count);
    const keepId = sheetsInfo[0].id;
    const removeIds = sheetsInfo.slice(1).map((s: any) => s.id);

    console.log(`- Keeping sheet ID: ${keepId} (${sheetsInfo[0].count} records)`);
    console.log(`- Removing sheet IDs: ${removeIds.join(', ')}`);

    totalSheetsToRemove += removeIds.length;

    // Check associated payments
    const associatedPayments = await Payment.find({ attendanceSheet: { $in: removeIds } });
    console.log(`- Associated payments to remove: ${associatedPayments.length}`);
    totalPaymentsToRemove += associatedPayments.length;
  }

  console.log('\n--- Summary ---');
  console.log(`Total duplicate groups: ${duplicates.length}`);
  console.log(`Total sheets to remove: ${totalSheetsToRemove}`);
  console.log(`Total payments to remove: ${totalPaymentsToRemove}`);

  await mongoose.connection.close();
};

analyzeDuplicates();
