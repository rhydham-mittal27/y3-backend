import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClassLead from './src/models/ClassLead';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-final';

async function findCorruptLeads() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const leads = await ClassLead.find({}).lean();
    console.log(`Checking ${leads.length} leads...`);

    for (const lead of leads) {
      if (lead.subject && Array.isArray(lead.subject)) {
        for (const s of lead.subject) {
          if (typeof s === 'string' && !/^[a-fA-F0-9]{24}$/.test(s)) {
            console.log(`Lead ID: ${lead._id}, LeadLabel: ${lead.leadId}, Corrupt Subject: ${s}`);
          }
        }
      } else if (lead.subject && typeof lead.subject === 'string' && !/^[a-fA-F0-9]{24}$/.test(lead.subject)) {
        console.log(`Lead ID: ${lead._id}, LeadLabel: ${lead.leadId}, Corrupt Subject (String): ${lead.subject}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  }
}

findCorruptLeads();
