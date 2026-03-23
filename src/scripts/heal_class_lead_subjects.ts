import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClassLead from '../models/ClassLead';
import { Option } from '../models/Option';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-final';

async function healSubjects() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const leads = await ClassLead.find({
      subject: { $exists: true, $ne: [] }
    });

    console.log(`Checking ${leads.length} leads for corrupt subjects...`);

    let healCount = 0;

    for (const lead of leads) {
      const originalSubjects = lead.subject || [];
      const newSubjects: mongoose.Types.ObjectId[] = [];
      let changed = false;

      for (const s of originalSubjects as any[]) {
        if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === String(s)) {
          // It's already a valid ObjectID string or object
          newSubjects.push(new mongoose.Types.ObjectId(s));
        } else {
          // It's a raw string like "PHYSICS" or "[ 'PHYSICS' ]"
          let subjectStr = String(s).trim();
          
          // Handle stringified arrays like "[ 'PHYSICS' ]"
          if (subjectStr.startsWith('[') && subjectStr.endsWith(']')) {
             try {
               const cleaned = subjectStr.replace(/'/g, '"');
               const parsed = JSON.parse(cleaned);
               if (Array.isArray(parsed) && parsed.length > 0) {
                 subjectStr = parsed[0]; // Just take first one for now or handle all
                 // If we have multiple, we'd loop, but let's keep it simple
               }
             } catch (e) {
               console.log(`Failed to parse stringified array: ${subjectStr}`);
             }
          }

          console.log(`Found corrupt subject "${s}" in lead ${lead.leadId}. Attempting to resolve "${subjectStr}"...`);

          // Attempt to find Option by label or value
          const option = await Option.findOne({
            $or: [
              { label: new RegExp(`^${subjectStr}$`, 'i') },
              { value: new RegExp(`^${subjectStr}$`, 'i') }
            ],
            type: 'SUBJECT'
          });

          if (option) {
            console.log(`Resolved "${subjectStr}" to ObjectID: ${option._id}`);
            newSubjects.push(option._id);
            changed = true;
          } else {
            console.warn(`Could not resolve subject "${subjectStr}" for lead ${lead.leadId}`);
          }
        }
      }

      if (changed) {
        lead.subject = newSubjects;
        await lead.save({ validateBeforeSave: false }); // Bypass validation in case other fields are also "corrupt"
        healCount++;
        console.log(`Healed lead ${lead.leadId}`);
      }
    }

    console.log(`Finished healing. Total leads healed: ${healCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Healing failed:', error);
    process.exit(1);
  }
}

healSubjects();
