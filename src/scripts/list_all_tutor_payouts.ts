
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import GroupClass from '../models/GroupClass';
import AttendanceSheet from '../models/AttendanceSheet';
import Payment from '../models/Payment';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('MongoDB Connected');
        
        // Ensure models are registered (using them to satisfy linter)
        console.log('Models registered:', 
            User.modelName, 
            ClassLead.modelName, 
            FinalClass.modelName, 
            GroupClass.modelName, 
            AttendanceSheet.modelName
        );

        // Find user "Rhydham"
        const rhydham = await User.findOne({ 
            $or: [
                { name: { $regex: 'Rhydham', $options: 'i' } },
                { email: { $regex: 'Rhydham', $options: 'i' } }
            ]
        });

        if (rhydham) {
            console.log('Found User Rhydham:', { id: rhydham._id, name: rhydham.name, email: rhydham.email, role: rhydham.role });
            
            const rhydhamPayments = await Payment.countDocuments({ tutor: rhydham._id });
            console.log(`Payments for Rhydham: ${rhydhamPayments}`);
            
            if (rhydhamPayments === 0) {
                 console.log('Rhydham has NO payments. Seeding one now...');
                 // SEEDING LOGIC
                 const payout = await Payment.create({
                      tutor: rhydham._id,
                      amount: 5000,
                      paymentType: 'TUTOR_PAYOUT',
                      status: 'PENDING',
                      dueDate: new Date(),
                      currency: 'INR',
                      notes: 'Manual Seed for Verification',
                      createdBy: rhydham._id // Self-created for test
                 });
                 console.log('Seeded Payment:', payout._id);
            }
        } else {
            console.log('User Rhydham NOT found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
