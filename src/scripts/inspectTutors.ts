
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Tutor from '../models/Tutor';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const checkTutors = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('Connected to MongoDB');
    
    const tutors = await Tutor.find({ teacherId: { $exists: true, $ne: null } }).limit(5);
    console.log('Existing teacherIds:');
    tutors.forEach(t => console.log(t.teacherId));
    
    const countWithout = await Tutor.countDocuments({ $or: [{ teacherId: { $exists: false } }, { teacherId: null }, { teacherId: '' }] });
    console.log(`Tutors without teacherId: ${countWithout}`);
    
  } catch (error) {
    console.error('Error during inspection:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

checkTutors();
