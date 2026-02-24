import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';

async function migrate() {
  await connectDB();
  const ClassLead = mongoose.models.ClassLead || require('./src/models/ClassLead').default;
  
  const leads = await ClassLead.find({ studentType: 'GROUP' });
  console.log(`Checking ${leads.length} GROUP leads...`);
  
  let updatedCount = 0;
  for (const lead of leads) {
    const details = lead.studentDetails || [];
    if (details.length > 0) {
        const calculatedTotal = details.reduce((sum: number, s: any) => sum + (Number(s.fees) || 0), 0);
        const calculatedTutorTotal = details.reduce((sum: number, s: any) => sum + (Number(s.tutorFees) || 0), 0);
        
        if (lead.paymentAmount === 0 && calculatedTotal > 0) {
            console.log(`Fixing Lead ${lead.leadId || lead._id}: ${lead.paymentAmount} -> ${calculatedTotal}`);
            lead.paymentAmount = calculatedTotal;
            lead.tutorFees = calculatedTutorTotal;
            await lead.save();
            updatedCount++;
        }
    }
  }
  
  console.log(`Migration complete. Updated ${updatedCount} leads.`);
  process.exit(0);
}

migrate().catch(console.error);
