
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import Student from '../models/Student';
import Payment from '../models/Payment';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const PAYMENT_TYPE = {
  TUTOR_PAYOUT: 'TUTOR_PAYOUT'
};

const PAYMENT_STATUS = {
  PENDING: 'PENDING'
};

const seedGroupTutorPayouts = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const classes = await FinalClass.find({ status: 'ACTIVE' });
    console.log(`Found ${classes.length} active classes.`);

    for (const cls of classes) {
      const students = await Student.find({ finalClass: cls._id });

      if (students.length > 1) {
        console.log(`Processing Group Class: ${cls.className} (${students.length} students)`);

        let tutorPayout = cls.tutorMonthlyFees || 0;
        
        // Calculation Strategy if monthly fee is missing
        if (!tutorPayout || tutorPayout === 0) {
            const rate = cls.tutorRatePerSession || 0;
            const sessions = cls.classesPerMonth || 0;
            if (rate > 0 && sessions > 0) {
                tutorPayout = rate * sessions;
                console.log(`Calculated Tutor Payout: ${tutorPayout} (${rate} * ${sessions})`);
            } else {
                console.warn(`Cannot calculate tutor payout for class ${cls.className}. Missing rate or sessions.`);
                continue;
            }
        } else {
             console.log(`Using existing Tutor Monthly Fee: ${tutorPayout}`);
        }

        const createdBy = cls.convertedBy || cls.coordinator; // Fallback

        if (!createdBy) {
            console.warn(`Skipping class ${cls.className}: No creator found.`);
            continue;
        }

        // Seed TUTOR_PAYOUT (Single)
        const existingPayout = await Payment.findOne({
            finalClass: cls._id,
            paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
            attendance: { $exists: false }
        });

        if (!existingPayout) {
             const dueDate = new Date(cls.startDate);
             dueDate.setDate(dueDate.getDate() + 7);

             await Payment.create({
                finalClass: cls._id,
                tutor: cls.tutor,
                amount: tutorPayout,
                currency: 'INR',
                status: PAYMENT_STATUS.PENDING,
                paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
                dueDate,
                createdBy,
                notes: 'Seeded Group Tutor Payout (Advance - Calculated)',
             });
             console.log(`Created TUTOR_PAYOUT for class ${cls.className}`);
        } else {
             console.log(`Tutor Payout already exists for class ${cls.className}`);
        }
      }
    }

    console.log('Seeding complete.');
  } catch (err) {
    console.error('Seeding Failed:', err);
  } finally {
    await mongoose.disconnect();
  }
};

seedGroupTutorPayouts();
