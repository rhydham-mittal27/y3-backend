import User from './src/models/User';
import Tutor from './src/models/Tutor';
import mongoose from 'mongoose';
import 'dotenv/config';

async function verify() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  await mongoose.connect(uri);
  
  const totalTutors = await Tutor.countDocuments();
  const tutorsWithId = await Tutor.countDocuments({ teacherId: { $ne: null, $ne: '' } });
  const totalUsers = await User.countDocuments({ role: 'TUTOR' });
  
  console.log('--- Verification Results ---');
  console.log('Total Tutors in DB:', totalTutors);
  console.log('Tutors with TeacherId:', tutorsWithId);
  console.log('Total Tutor Users:', totalUsers);
  
  const sample = await Tutor.findOne({ teacherId: { $ne: null } }).populate('user');
  if (sample) {
    console.log('Sample Tutor TeacherId:', sample.teacherId);
    console.log('Sample User Name:', (sample.user as any)?.name);
  } else {
    console.log('No tutors found with teacherId');
  }
  
  const missingIds = await Tutor.find({ $or: [{ teacherId: null }, { teacherId: '' }] }).limit(5);
  if (missingIds.length > 0) {
    console.log('Found tutors missing IDs:', missingIds.length, '(sample shown below if any)');
    for (const t of missingIds) {
        console.log('Tutor without ID, User ID:', t.user);
    }
  }

  await mongoose.disconnect();
}

verify().catch(console.error);
