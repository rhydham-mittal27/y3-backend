import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-v3';

async function check() {
  await mongoose.connect(MONGODB_URI);
  
  const tutor = await Tutor.findOne({ subjects: { $exists: true, $not: { $size: 0 } } });
  console.log('Sample Tutor Subjects:', tutor?.subjects);
  
  const lead = await ClassLead.findOne({ subject: { $exists: true, $not: { $size: 0 } } });
  console.log('Sample Lead Subjects:', lead?.subject);

  await mongoose.disconnect();
}

check();
