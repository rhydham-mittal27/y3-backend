import 'dotenv/config';
import mongoose from 'mongoose';
import Tutor from '../models/Tutor';

async function verify() {
  const uri = process.env.MONGODB_URI || '';
  await mongoose.connect(uri);
  
  // Find a tutor who likely has an expanded range of grades
  const tutors = await Tutor.find({ 'preferredGrades.9': { $exists: true } }).limit(2);
  
  if (!tutors || tutors.length === 0) {
    console.log('No tutors found with 10+ grades. Checking any tutor...');
    const anyTutor = await Tutor.findOne();
    console.log(JSON.stringify(anyTutor, null, 2));
  } else {
    tutors.forEach(t => {
        console.log(`Tutor ID: ${t.teacherId}`);
        console.log(`Grades: ${t.preferredGrades?.join(', ')}`);
        console.log(`Subjects: ${t.subjects?.join(', ')}`);
        console.log('---');
    });
  }
  
  await mongoose.disconnect();
}

verify();
