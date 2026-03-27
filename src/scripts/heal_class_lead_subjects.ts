import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClassLead from '../models/ClassLead';
import Option from '../models/Option';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-final';

async function healSubjects() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Use raw collection to bypass Mongoose Schema casting which strips out raw strings!
    const leadsCollection = ClassLead.collection;
    const leads = await leadsCollection.find({
      subject: { $exists: true, $ne: [] }
    }).toArray();

    console.log(`Checking ${leads.length} leads for corrupt subjects natively...`);

    let healCount = 0;

    for (const lead of leads) {
      const originalSubjects = lead.subject || [];
      const newSubjects: any[] = [];
      let changed = false;

      for (const s of originalSubjects) {
        // If it's already an ObjectId (MongoDB native ObjectId), keep it
        if (s instanceof mongoose.Types.ObjectId) {
          newSubjects.push(s);
        } else if (typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s)) {
          newSubjects.push(new mongoose.Types.ObjectId(s));
          changed = true;
        } else {
          // It's a raw string like "PHYSICS" or "[ 'PHYSICS' ]"
          let subjectStr = String(s).trim();
          
          if (subjectStr.startsWith('[') && subjectStr.endsWith(']')) {
             try {
               const cleaned = subjectStr.replace(/'/g, '"');
               const parsed = JSON.parse(cleaned);
               if (Array.isArray(parsed) && parsed.length > 0) {
                 subjectStr = parsed[0];
               }
             } catch (e) {}
          }

          console.log(`Found corrupt subject "${s}" in lead ${lead.leadId}. Resolving "${subjectStr}"...`);

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
        await leadsCollection.updateOne(
          { _id: lead._id },
          { $set: { subject: newSubjects } }
        );
        healCount++;
        console.log(`Healed lead ${lead.leadId}`);
      }
    }

    console.log(`Finished healing natively. Total leads healed: ${healCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Healing failed:', error);
    process.exit(1);
  }
}

healSubjects();
