import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';
import { createClassLead, getClassLeadById } from './src/services/leadService';
import { CLASS_LEAD_STATUS } from './src/config/constants';

async function reproduce() {
  await connectDB();
  
  const creatorId = new mongoose.Types.ObjectId(); // Mock creator
  
  const payload = {
    studentType: 'GROUP' as const,
    studentName: 'Test Group',
    grade: 'Grade 10',
    subject: ['Math'],
    board: 'CBSE',
    mode: 'ONLINE',
    timing: 'Evening',
    numberOfStudents: 2,
    studentDetails: [
      { name: 'S1', gender: 'M' as const, fees: 5000, tutorFees: 3000 },
      { name: 'S2', gender: 'F' as const, fees: 6000, tutorFees: 4000 }
    ],
    createdBy: creatorId.toString(),
    paymentAmount: 11000,
    tutorFees: 7000
  };
  
  console.log('Creating lead...');
  const createdLead = await createClassLead(payload as any);
  console.log('Created Lead ID:', createdLead._id);
  console.log('Created Lead studentDetails:', JSON.stringify(createdLead.studentDetails, null, 2));
  
  console.log('\nFetching lead by ID...');
  const fetchedLead = await getClassLeadById(createdLead._id.toString());
  console.log('Fetched Lead studentDetails:', JSON.stringify(fetchedLead.studentDetails, null, 2));
  
  // Cleanup
  const ClassLead = mongoose.models.ClassLead;
  const Groupleads = mongoose.models.Groupleads;
  await ClassLead.deleteOne({ _id: createdLead._id });
  if (createdLead.groupClass) {
      await Groupleads.deleteOne({ _id: createdLead.groupClass });
  }
  
  process.exit(0);
}

reproduce().catch(console.error);
