import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';

async function diagnose() {
  await connectDB();
  
  // Ensure models are registered
  const ClassLead = mongoose.models.ClassLead || require('./src/models/ClassLead').default;
  const Groupleads = mongoose.models.Groupleads || require('./src/models/GroupClass').default;

  const groupLead = await ClassLead.findOne({ studentType: 'GROUP' }).populate('groupClass');
  
  if (!groupLead) {
    console.log('No GROUP lead found.');
  } else {
    console.log('--- ClassLead ---');
    console.log('ID:', groupLead._id);
    console.log('studentName:', groupLead.studentName);
    console.log('studentDetails count:', groupLead.studentDetails?.length);
    console.log('studentDetails:', JSON.stringify(groupLead.studentDetails, null, 2));
    
    if (groupLead.groupClass) {
        console.log('--- groupClass (populated) ---');
        console.log('ID:', (groupLead.groupClass as any)._id);
        console.log('students count:', (groupLead.groupClass as any).students?.length);
        console.log('students:', JSON.stringify((groupLead.groupClass as any).students, null, 2));
    } else {
        console.log('groupClass is NOT populated or is null.');
    }
  }
  process.exit(0);
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
