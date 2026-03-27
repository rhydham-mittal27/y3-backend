import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Payment from '../models/Payment';
import { PAYMENT_TYPE, PAYMENT_STATUS, VERIFICATION_FEE_DEDUCT_AMOUNT } from '../config/constants';

const healVerificationFees = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const result = await Payment.updateMany(
      { 
        paymentType: PAYMENT_TYPE.TUTOR_VERIFICATION_FEES,
        status: PAYMENT_STATUS.PENDING,
        amount: 500 
      },
      { 
        $set: { amount: VERIFICATION_FEE_DEDUCT_AMOUNT || 700 } 
      }
    );

    console.log(`Updated ${result.modifiedCount} pending verification fee payments from 500 to 700.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

healVerificationFees();
