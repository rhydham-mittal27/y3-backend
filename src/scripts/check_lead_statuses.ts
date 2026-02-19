
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import ClassLead from '../models/ClassLead';
import User from '../models/User';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ys_database');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const checkStatuses = async () => {
  await connectDB();

  const statusCounts = await ClassLead.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  console.log('Lead Status Counts:');
  statusCounts.forEach(s => {
      console.log(`${s._id}: ${s.count}`);
  });

  // Also check if any leads have missing statuses or weird values
  const demoCompleted = await ClassLead.countDocuments({ status: 'DEMO_COMPLETED' });
  const demoApproved = await ClassLead.countDocuments({ status: 'DEMO_APPROVED_BY_PARENT' });
  const noResponse = await ClassLead.countDocuments({ status: 'PARENT_DIDNT_RESPOND' });
  
  console.log(`DEMO_COMPLETED count: ${demoCompleted}`);
  console.log(`DEMO_APPROVED_BY_PARENT count: ${demoApproved}`);
  console.log(`PARENT_DIDNT_RESPOND count: ${noResponse}`);

  if (demoCompleted === 0) {
      console.log('Seeding a DEMO_COMPLETED lead for testing...');
      // Fetch a valid user ID for createdBy
      const admin = await User.findOne({ role: 'ADMIN' });
      const createdBy = admin ? admin._id : new mongoose.Types.ObjectId();
      
      await ClassLead.create({
          studentName: 'Demo Pending Test',
          studentGender: 'M',
          studentType: 'SINGLE',
          grade: '10',
          subject: ['Math'],
          board: 'CBSE',
          mode: 'ONLINE',
          timing: 'Anytime',
          status: 'DEMO_COMPLETED',
          leadId: 'LTEST001',
          createdBy: createdBy
      });
      console.log('Seeded lead: Demo Pending Test (LTEST001)');
  }

  process.exit();
};

checkStatuses();
