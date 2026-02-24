import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';

async function diagnose() {
  await connectDB();
  const ClassLead = mongoose.models.ClassLead || require('./src/models/ClassLead').default;
  const Groupleads = mongoose.models.Groupleads || require('./src/models/GroupClass').default;

  const leads = await ClassLead.find({ studentType: 'GROUP' }).populate('groupClass');
  
  console.log(`Checking ${leads.length} GROUP leads...`);
  
  leads.forEach((lead: any) => {
    const details = lead.studentDetails || [];
    const gcDetails = lead.groupClass?.students || [];
    
    console.log(`Lead ID: ${lead.leadId || lead._id}, Name: ${lead.studentName}`);
    console.log(`  paymentAmount (top-level): ${lead.paymentAmount}`);
    console.log(`  studentDetails length: ${details.length}`);
    details.forEach((s: any, i: number) => {
        console.log(`    S${i+1} fees: ${s.fees}, tutorFees: ${s.tutorFees}`);
    });
    
    if (lead.groupClass) {
        console.log(`  groupClass.students length: ${gcDetails.length}`);
        gcDetails.forEach((s: any, i: number) => {
            console.log(`    GC S${i+1} fees: ${s.fees}, tutorFees: ${s.tutorFees}`);
        });
    } else {
        console.log('  groupClass NOT FOUND');
    }
    console.log('---');
  });
  
  process.exit(0);
}

diagnose().catch(console.error);
