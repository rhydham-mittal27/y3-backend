import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AttendanceSheet from '../models/AttendanceSheet';

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

const analyzeDuplicatesV2 = async () => {
  await connectDB();

  console.log('Analyzing Classes with multiple PENDING sheets...');

  const summary = await AttendanceSheet.aggregate([
    {
      $match: { status: 'PENDING' }
    },
    {
      $group: {
        _id: {
          finalClass: '$finalClass',
          groupClass: '$groupClass'
        },
        count: { $sum: 1 },
        sheets: { $push: { id: '$_id', cycle: '$cycleNumber', records: { $size: '$records' }, createdAt: '$createdAt' } }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]);

  console.log(`Found ${summary.length} classes with multiple PENDING sheets.`);

  for (const item of summary) {
    console.log(`\nClass: ${item._id.finalClass || item._id.groupClass}`);
    console.log(`Pending Sheets: ${item.count}`);
    item.sheets.forEach((s: any) => {
      console.log(` - ID: ${s.id}, Cycle: ${s.cycle}, Records: ${s.records}, Created: ${s.createdAt}`);
    });
  }

  await mongoose.connection.close();
};

analyzeDuplicatesV2();
