
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Payment from '../models/Payment';
import { PAYMENT_STATUS, PAYMENT_TYPE } from '../config/constants';

dotenv.config();

const checkPayments = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const totalPayments = await Payment.countDocuments();
    console.log(`Total Payments: ${totalPayments}`);

    const fs = require('fs');
    let output = '';
    const log = (msg: string) => { console.log(msg); output += msg + '\\n'; };

    const paidPayments = await Payment.countDocuments({ status: PAYMENT_STATUS.PAID });
    
    log(`Total Payments: ${totalPayments}`);
    log(`Paid Payments: ${paidPayments}`);

    const withPaymentDate = await Payment.countDocuments({ paymentDate: { $exists: true, $ne: null } });
    log(`Payments with paymentDate: ${withPaymentDate}`);

    const feesCollected = await Payment.countDocuments({ 
        status: PAYMENT_STATUS.PAID,
        $or: [
            { paymentType: PAYMENT_TYPE.FEES_COLLECTED },
            { paymentType: { $exists: false } }, 
            { paymentType: null }
        ]
    });
    log(`Fees Collected (Paid): ${feesCollected}`);

    const tutorPayouts = await Payment.countDocuments({ 
        status: PAYMENT_STATUS.PAID,
        paymentType: PAYMENT_TYPE.TUTOR_PAYOUT 
    });
    log(`Tutor Payouts (Paid): ${tutorPayouts}`);
    
    // Check if we have any payments in the last 365 days
    const recent = await Payment.countDocuments({ 
        createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 365)) } 
    });
    log(`Payments in last 365 days (by createdAt): ${recent}`);
    log(`Payments in last 365 days (by paymentDate): ${await Payment.countDocuments({ paymentDate: { $gte: new Date(new Date().setDate(new Date().getDate() - 365)) } })}`);

    fs.writeFileSync('debug_payment_results.txt', output);

  } catch (error) {
    console.error('Error checking payments:', error);
  } finally {
    await mongoose.disconnect();
  }
};

checkPayments();
