
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import Student from '../models/Student';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const inspectGroupClasses = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const classes = await FinalClass.find({ status: 'ACTIVE' });
    
    for (const cls of classes) {
      const students = await Student.find({ finalClass: cls._id });
      if (students.length > 1) {
          console.log('--- Group Class Found ---');
          console.log(`ID: ${cls._id}`);
          console.log(`Name: ${cls.className}`);
          console.log(`Monthly Fees: ${cls.monthlyFees}`);
          console.log(`Tutor Monthly Fees: ${cls.tutorMonthlyFees}`);
          console.log(`Classes Per Month: ${cls.classesPerMonth}`);
          console.log(`Rate Per Session: ${cls.ratePerSession}`);
          console.log(`Tutor Rate Per Session: ${cls.tutorRatePerSession}`);
          console.log(`Students: ${students.length}`);
          console.log('-------------------------');
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

inspectGroupClasses();
