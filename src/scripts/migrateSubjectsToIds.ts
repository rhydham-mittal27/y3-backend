import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-v3';

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db!;

    // 1. Fetch all subject options for mapping
    const subjectOptions = await db.collection('options').find({ type: 'SUBJECT' }).toArray();
    console.log(`Found ${subjectOptions.length} subject options.`);

    const mapping: Record<string, mongoose.Types.ObjectId> = {};
    subjectOptions.forEach(opt => {
      mapping[opt.value.toLowerCase()] = opt._id as mongoose.Types.ObjectId;
      mapping[opt.label.toLowerCase()] = opt._id as mongoose.Types.ObjectId;
      const snakeLabel = opt.label.toUpperCase().replace(/\s+/g, '_');
      mapping[snakeLabel.toLowerCase()] = opt._id as mongoose.Types.ObjectId;
    });

    const mapToId = (item: any): mongoose.Types.ObjectId | null => {
      if (!item) return null;
      if (mongoose.isValidObjectId(item)) {
          return typeof item === 'string' ? new mongoose.Types.ObjectId(item) : item;
      }
      const str = String(item).toLowerCase().trim();
      return mapping[str] || null;
    };

    // 2. Migrate Tutors
    console.log('Migrating Tutors...');
    const tutors = await db.collection('tutors').find({}).toArray();
    let tutorTotal = 0;
    let tutorUpdated = 0;

    for (const tutor of tutors) {
      let modified = false;
      tutorTotal++;

      let newSubjects: any[] = [];
      if (tutor.subjects && Array.isArray(tutor.subjects)) {
        newSubjects = tutor.subjects
          .map(s => mapToId(s))
          .filter(id => id !== null);
        
        if (JSON.stringify(newSubjects) !== JSON.stringify(tutor.subjects)) {
            modified = true;
        }
      }

      let newPreferred: any[] = [];
      if (tutor.preferredSubjects && Array.isArray(tutor.preferredSubjects)) {
        newPreferred = tutor.preferredSubjects
          .map(s => mapToId(s))
          .filter(id => id !== null);
        
        if (JSON.stringify(newPreferred) !== JSON.stringify(tutor.preferredSubjects)) {
            modified = true;
        }
      }

      if (modified) {
        await db.collection('tutors').updateOne(
            { _id: tutor._id },
            { $set: { subjects: newSubjects, preferredSubjects: newPreferred } }
        );
        tutorUpdated++;
      }
    }
    console.log(`Tutors: Total ${tutorTotal}, Updated ${tutorUpdated}`);

    // 3. Migrate ClassLeads
    console.log('Migrating ClassLeads...');
    const leads = await db.collection('classleads').find({}).toArray();
    let leadTotal = 0;
    let leadUpdated = 0;

    for (const lead of leads) {
      let modified = false;
      leadTotal++;

      let newLeadSubjects: any[] = [];
      if (lead.subject && Array.isArray(lead.subject)) {
        newLeadSubjects = lead.subject
          .map(s => mapToId(s))
          .filter(id => id !== null);
        
        if (JSON.stringify(newLeadSubjects) !== JSON.stringify(lead.subject)) {
            modified = true;
        }
      }

      let newDetails = lead.studentDetails;
      if (lead.studentDetails && Array.isArray(lead.studentDetails)) {
        for (let i = 0; i < newDetails.length; i++) {
          if (newDetails[i].subject && Array.isArray(newDetails[i].subject)) {
            const mapped = newDetails[i].subject
              .map((s: any) => mapToId(s))
              .filter((id: any) => id !== null);
            
            if (JSON.stringify(mapped) !== JSON.stringify(newDetails[i].subject)) {
              newDetails[i].subject = mapped;
              modified = true;
            }
          }
        }
      }

      if (modified) {
        await db.collection('classleads').updateOne(
            { _id: lead._id },
            { $set: { subject: newLeadSubjects, studentDetails: newDetails } }
        );
        leadUpdated++;
      }
    }
    console.log(`ClassLeads: Total ${leadTotal}, Updated ${leadUpdated}`);

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
