
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Payment from '../models/Payment';
import { PAYMENT_TYPE, PAYMENT_STATUS } from '../config/constants';

dotenv.config();

const checkPaymentRatios = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        const feesCount = await Payment.countDocuments({ paymentType: PAYMENT_TYPE.FEES_COLLECTED });
        const payoutCount = await Payment.countDocuments({ paymentType: PAYMENT_TYPE.TUTOR_PAYOUT });
        const nullTypeCount = await Payment.countDocuments({ paymentType: null });
        
        const feesSumAgg = await Payment.aggregate([
            { $match: { paymentType: PAYMENT_TYPE.FEES_COLLECTED, status: PAYMENT_STATUS.PAID } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const payoutSumAgg = await Payment.aggregate([
            { $match: { paymentType: PAYMENT_TYPE.TUTOR_PAYOUT, status: PAYMENT_STATUS.PAID } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const feesSum = feesSumAgg[0]?.total || 0;
        const payoutSum = payoutSumAgg[0]?.total || 0;

        console.log('--- Payment Stats ---');
        console.log(`Fees Count: ${feesCount}`);
        console.log(`Payout Count: ${payoutCount}`);
        console.log(`Null Type Count: ${nullTypeCount}`);
        console.log(`Total Fees Amount (Paid): ${feesSum}`);
        console.log(`Total Payout Amount (Paid): ${payoutSum}`);
        
        if (feesSum > 0) {
            console.log(`Payout to Fees Ratio: ${((payoutSum / feesSum) * 100).toFixed(2)}%`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkPaymentRatios();
