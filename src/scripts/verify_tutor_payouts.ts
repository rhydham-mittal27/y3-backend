
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User';
import FinalClass from '../models/FinalClass';
import AttendanceSheet from '../models/AttendanceSheet';
import Payment from '../models/Payment';
import { approveAttendanceSheet } from '../services/attendanceSheetService';
import { getPaymentsByTutor } from '../services/paymentService'; // Add import
import { PAYMENT_TYPE, ATTENDANCE_STATUS } from '../config/constants';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('MongoDB Connected');

        // 1. Create Mock Data
        const tutorId = new mongoose.Types.ObjectId();
        const coordinatorId = new mongoose.Types.ObjectId();
        const finalClassId = new mongoose.Types.ObjectId();
        
        // Mock Tutor
        const mockTutor = await User.create({
            _id: tutorId,
            name: 'Test Tutor Payout',
            email: `test_tutor_${Date.now()}@example.com`,
            password: 'password123',
            role: 'TUTOR',
            verificationStatus: 'VERIFIED'
        });
        console.log('Tutor Created:', mockTutor._id);

        // Mock FinalClass
        const mockClass = await FinalClass.create({
            _id: finalClassId,
            className: 'Test Class Payout',
            classLead: new mongoose.Types.ObjectId(), // Mock ID
            tutor: tutorId,
            coordinator: coordinatorId,
            startDate: new Date(),
            studentName: 'Test Student',
            subject: ['Math'],
            grade: '10',
            board: 'CBSE',
            mode: 'ONLINE',
            convertedBy: coordinatorId,
            tutorRatePerSession: 500, // Important!
            classesPerMonth: 8
        });

        console.log('Class Created:', mockClass._id);

        // Mock Attendance Sheet
        const sheet = await AttendanceSheet.create({
            finalClass: finalClassId,
            coordinator: coordinatorId,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            cycleNumber: 1,
            periodLabel: 'Cycle 1 Test',
            records: [], // Will add records
            status: 'PENDING',
            createdBy: coordinatorId,
            totalSessionsPlanned: 8,
            sheetType: 'SINGLE'
        });

        // Add 8 records
        for (let i = 0; i < 8; i++) {
            sheet.records.push({
                sessionDate: new Date(),
                durationHours: 1,
                topicCovered: `Session ${i+1}`,
                studentAttendanceStatus: 'PRESENT' as any,
                status: ATTENDANCE_STATUS.PENDING,
                submittedBy: tutorId,
                submittedAt: new Date(), // Added missing field
                tutor: tutorId
            });
        }
        await sheet.save();
        console.log('Sheet Created:', sheet._id);

        // 2. Approve Sheet (Should trigger payment creation)
        console.log('Approving sheet...');
        await approveAttendanceSheet(sheet._id.toString(), coordinatorId.toString(), true); // isAdmin=true to bypass check
        
        // 3. Verify Payment
        const payment = await Payment.findOne({
            attendanceSheet: sheet._id,
            paymentType: PAYMENT_TYPE.TUTOR_PAYOUT
        });

        if (payment) {
            console.log('SUCCESS: Payment found via direct query!');
            console.log('Amount:', payment.amount);
            console.log('Tutor:', payment.tutor);
            console.log('Status:', payment.status);
            
            if (payment.amount === 8 * 500) {
                 console.log('Payment amount is correct.');
            } else {
                 console.error(`Payment amount mismatch. Expected ${8*500}, got ${payment.amount}`);
            }

            // Verify API Service Logic
            console.log('Verifying getPaymentsByTutor service...');
            const apiResult = await getPaymentsByTutor(tutorId.toString());
            const foundInApi = apiResult.payments.find((p: any) => p._id.toString() === payment._id.toString());
            
            if (foundInApi) {
                console.log('SUCCESS: Payment found via getPaymentsByTutor!');
            } else {
                console.error('FAILURE: Payment NOT found via getPaymentsByTutor.');
                console.log('API Result count:', apiResult.payments.length);
            }

        } else {
            console.error('FAILURE: Payment NOT found.');
        }

        // Cleanup
        await User.findByIdAndDelete(tutorId);
        await FinalClass.findByIdAndDelete(finalClassId);
        await AttendanceSheet.findByIdAndDelete(sheet._id);
        if (payment) await Payment.findByIdAndDelete(payment._id);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
