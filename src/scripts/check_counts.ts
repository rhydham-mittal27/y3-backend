import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';
import User from '../models/User';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-v3';

async function checkCount() {
  await mongoose.connect(MONGODB_URI);
  
  const tutorCount = await Tutor.countDocuments();
  const leadCount = await ClassLead.countDocuments();
  const userCount = await User.countDocuments();

  console.log('Tutor Count:', tutorCount);
  console.log('ClassLead Count:', leadCount);
  console.log('User Count:', userCount);

  await mongoose.disconnect();
}

checkCount();
