import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AttendanceSheet from '../models/AttendanceSheet';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourshikshak';
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected to:', mongoURI.split('@')[1] || 'localhost');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

const listRecentSheets = async () => {
  await connectDB();

  console.log('Listing 10 most recent Attendance Sheets...');

  const sheets = await AttendanceSheet.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('finalClass', 'className')
    .lean();

  sheets.forEach((s: any) => {
    console.log(`\nID: ${s._id}`);
    console.log(`Class: ${s.finalClass?.className || s.groupClass || 'N/A'}`);
    console.log(`Cycle: ${s.cycleNumber}, Status: ${s.status}, Records: ${s.records?.length || 0}`);
    console.log(`Created: ${s.createdAt}`);
    console.log(`SubmittedAt: ${s.submittedAt || 'N/A'}`);
  });

  await mongoose.connection.close();
};

listRecentSheets();
