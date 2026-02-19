
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Payment from '../models/Payment';
import { getPaymentsByTutor } from '../services/paymentService';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('MongoDB Connected');

        // Find a tutor with payments
        // We'll search for any payment with paymentType TUTOR_PAYOUT first to find a candidate
        const payout = await Payment.findOne({ paymentType: 'TUTOR_PAYOUT' });
        
        let tutorId;
        if (payout) {
            console.log('Found a TUTOR_PAYOUT record. Using its tutor.');
            tutorId = payout.tutor;
        } else {
            console.log('No TUTOR_PAYOUT found. Finding any tutor with any payment.');
            const p = await Payment.findOne({ tutor: { $exists: true } });
            if (p) {
                 tutorId = p.tutor;
            } else {
                console.log('No payments found at all.');
                return;
            }
        }
        
        console.log('Checking payments for Tutor ID:', tutorId);
        
        if (!tutorId) {
            console.log('No tutor id available to fetch payments for. Exiting.');
            return;
        }

        const result = await getPaymentsByTutor(String(tutorId));
        
        console.log(`Total Payments Found: ${result.payments.length}`);
        
        // Group by type
        const byType: Record<string, number> = {};
        result.payments.forEach((p: any) => {
            const type = p.paymentType || 'UNKNOWN';
            byType[type] = (byType[type] || 0) + 1;
        });
        console.log('Counts by Type:', byType);
        
        // List first 5 payments
        console.log('Sample Payments:');
        result.payments.slice(0, 5).forEach((p: any) => {
            console.log(`- [${p.paymentType}] Amount: ${p.amount}, Status: ${p.status}, Date: ${p.createdAt}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
