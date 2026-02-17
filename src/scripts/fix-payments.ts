import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import AttendanceSheet from '../models/AttendanceSheet';
import { createPaymentForSheet } from '../services/paymentService';

const uri = process.env.MONGODB_URI || '';

async function run() {
  if (!uri) {
    console.error('Missing MONGODB_URI in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // 1. Backfill Rates
    console.log('--- Phase 1: Backfilling rates ---');
    const classes = await FinalClass.find().populate('classLead');
    console.log(`Found ${classes.length} classes to process`);

    for (const cls of classes) {
      const lead = cls.classLead as any;
      if (!lead) {
        console.log(`Skipping ${cls.className}: No lead found`);
        continue;
      }

      const denom = (lead.classesPerMonth || cls.totalSessions || 8);
      const parentRate = (lead.paymentAmount || 0) / denom;
      const tutorRate = (lead.tutorFees || 0) / denom;

      console.log(`Updating ${cls.className}: Parent Rate ${parentRate}, Tutor Rate ${tutorRate}`);
      cls.ratePerSession = parentRate;
      cls.tutorRatePerSession = tutorRate;
      
      // New fields - cast to any to avoid potential TS interface lag
      (cls as any).monthlyFees = lead.paymentAmount || 0;
      (cls as any).tutorMonthlyFees = lead.tutorFees || 0;
      
      await cls.save();
    }

    // 2. Generate Missing Payments
    console.log('\n--- Phase 2: Generating missing cycle payments ---');
    const sheets = await AttendanceSheet.find();
    console.log(`Found ${sheets.length} attendance sheets`);

    for (const sheet of sheets) {
      try {
        // createCyclePayments checks if numSessions > 0 and if cls exists.
        // It doesn't check for existing payments, so we should be careful.
        // Actually, let's just call it; it creates payments.
        // If the user wants to seed *only* missing ones, we'd check Payment model.
        
        const Payment = require('../models/Payment').default;
        const existing = await Payment.findOne({ attendanceSheet: sheet._id });
        if (existing) {
          console.log(`Skipping sheet ${sheet._id}: Payments already exist`);
          continue;
        }

        console.log(`Creating payments for sheet ${sheet._id} (${sheet.periodLabel})`);
        await createPaymentForSheet(String(sheet._id), '000000000000000000000000');
      } catch (err: any) {
        console.error(`Error processing sheet ${sheet._id}: ${err.message}`);
      }
    }

    console.log('\nAll done!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

run();
