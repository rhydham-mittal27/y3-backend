import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-v3';

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    const tutorCollection = mongoose.connection.db!.collection('tutors');
    const tutors = await tutorCollection.find({}).limit(10).toArray();
    console.log(`Checking ${tutors.length} sample tutors...`);
    
    tutors.forEach(t => {
      console.log(`Tutor ID: ${t._id}, TeacherID: ${t.teacherId}, Subjects:`, t.subjects);
    });

    const leadCollection = mongoose.connection.db!.collection('classleads');
    const leads = await leadCollection.find({}).limit(10).toArray();
    console.log(`Checking ${leads.length} sample class leads...`);
    
    leads.forEach(l => {
        console.log(`Lead ID: ${l._id}, LeadID: ${l.leadId}, Subject:`, l.subject);
    });

  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
