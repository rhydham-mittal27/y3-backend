import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FinalClass from '../models/FinalClass';

dotenv.config();

async function backfillRates() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not found');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const classes = await FinalClass.find().populate('classLead');
    console.log(`Found ${classes.length} final classes`);

    for (const cls of classes) {
      const lead = cls.classLead as any;
      if (!lead) {
        console.warn(`No lead found for class ${cls.className}`);
        continue;
      }

      const denom = (lead.classesPerMonth || cls.totalSessions || 8);
      const parentRate = (lead.paymentAmount || 0) / denom;
      const tutorRate = (lead.tutorFees || 0) / denom;

      console.log(`Updating ${cls.className}: 
        Parent Rate: ${cls.ratePerSession} -> ${parentRate}
        Tutor Rate: ${cls.tutorRatePerSession} -> ${tutorRate}`);

      cls.ratePerSession = parentRate;
      cls.tutorRatePerSession = tutorRate;
      await cls.save();
    }

    console.log('Backfill complete');
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillRates();
