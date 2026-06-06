import 'dotenv/config';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function main() {
  if (!uri) {
    console.error('Missing MONGODB_URI/DATABASE_URL in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const leadId = '6a20fe6ee2845b5b5946d564';
  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    console.error(`Class lead with ID ${leadId} not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Current Lead Status: ${lead.status}`);
  console.log(`Assigned Tutor: ${lead.assignedTutor}`);

  // Reset the status to ANNOUNCED
  lead.status = 'ANNOUNCED';
  // Clear the assigned tutor and demo details so it is fresh for the new scheduling
  lead.assignedTutor = null;
  lead.demoDetails = undefined;

  await lead.save();
  console.log('Successfully reset lead to ANNOUNCED and cleared the previous assigned tutor/demo details.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error resetting lead:', err);
  process.exit(1);
});
