import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';
import { createClassLead, updateClassLead, getClassLeadById } from './src/services/leadService';

async function verifyUpdate() {
  await connectDB();
  
  const creatorId = new mongoose.Types.ObjectId();
  
  const payload = {
    studentType: 'GROUP' as const,
    studentName: 'Verification Group',
    grade: 'Grade 10',
    subject: ['Math'],
    board: 'CBSE',
    mode: 'ONLINE',
    timing: 'Evening',
    numberOfStudents: 1,
    studentDetails: [
      { name: 'V1', gender: 'M' as const, fees: 5000, tutorFees: 3000 }
    ],
    createdBy: creatorId.toString(),
    paymentAmount: 5000,
    tutorFees: 3000
  };
  
  console.log('Creating lead...');
  const createdLead = await createClassLead(payload as any);
  console.log('Created Lead ID:', createdLead._id);
  console.log('Created GroupClass ID:', createdLead.groupClass);

  const Groupleads = mongoose.model('Groupleads');
  let gc = await Groupleads.findById(createdLead.groupClass);
  console.log('Initial GroupClass students:', JSON.stringify(gc?.students, null, 2));

  console.log('\nUpdating lead studentDetails...');
  const updateData = {
    studentDetails: [
      { name: 'V1 Updated', gender: 'M' as const, fees: 7000, tutorFees: 4000 }
    ],
    paymentAmount: 7000,
    tutorFees: 4000
  };

  await updateClassLead(createdLead._id.toString(), updateData as any);
  
  console.log('\nFetching lead after update...');
  const fetchedLead = await getClassLeadById(createdLead._id.toString());
  console.log('Fetched Lead studentDetails:', JSON.stringify(fetchedLead.studentDetails, null, 2));

  gc = await Groupleads.findById(createdLead.groupClass);
  console.log('Updated GroupClass students:', JSON.stringify(gc?.students, null, 2));

  if (gc?.students[0].fees === 7000 && fetchedLead.studentDetails[0].fees === 7000) {
      console.log('\nVERIFICATION SUCCESS: Lead and Groupleads are in sync.');
  } else {
      console.log('\nVERIFICATION FAILED: Mismatch in expected fees.');
  }

  // Cleanup
  const ClassLead = mongoose.models.ClassLead;
  await ClassLead.deleteOne({ _id: createdLead._id });
  await Groupleads.deleteOne({ _id: createdLead.groupClass });
  
  process.exit(0);
}

verifyUpdate().catch(console.error);
