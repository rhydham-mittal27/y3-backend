import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const syncOwnership = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const leads = await ClassLead.find({});
    console.log(`Found ${leads.length} leads. Checking associated classes...`);

    let updatedCount = 0;
    for (const lead of leads) {
      const result = await FinalClass.updateMany(
        { classLead: lead._id, convertedBy: { $ne: lead.createdBy } },
        { $set: { convertedBy: lead.createdBy } }
      );
      if (result.modifiedCount > 0) {
        updatedCount += result.modifiedCount;
        console.log(`Updated ${result.modifiedCount} class(es) for lead ${lead.leadId} -> convertedBy set to ${lead.createdBy}`);
      }
    }

    console.log(`Sync complete. Total classes updated: ${updatedCount}`);
    process.exit(0);
  } catch (err) {
    console.error('Error during sync:', err);
    process.exit(1);
  }
};

syncOwnership();
