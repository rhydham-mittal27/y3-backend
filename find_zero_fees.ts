import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';

async function findZeroFees() {
  await connectDB();
  
  const ClassLead = mongoose.models.ClassLead || require('./src/models/ClassLead').default;
  
  const leads = await ClassLead.find({ studentType: 'GROUP' });
  
  console.log(`Found ${leads.length} GROUP leads.`);
  
  leads.forEach((lead: any) => {
    const hasZeroFees = lead.studentDetails?.some((s: any) => s.fees === 0);
    const totalFees = lead.studentDetails?.reduce((sum: number, s: any) => sum + (s.fees || 0), 0) || 0;
    
    console.log(`Lead ID: ${lead.leadId || lead._id}`);
    console.log(`  studentName: ${lead.studentName}`);
    console.log(`  Total Fees: ${totalFees}`);
    console.log(`  paymentAmount: ${lead.paymentAmount}`);
    console.log(`  Has individual zero fees student: ${hasZeroFees}`);
    if (hasZeroFees) {
        console.log('  Student Details:', JSON.stringify(lead.studentDetails, null, 2));
    }
  });
  
  process.exit(0);
}

findZeroFees().catch(console.error);
