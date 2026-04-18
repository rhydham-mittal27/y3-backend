import mongoose from 'mongoose';
import { addDailyAttendance } from '../services/attendanceSheetService';
import FinalClass from '../models/FinalClass';
import { USER_ROLES, FINAL_CLASS_STATUS } from '../config/constants';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const verifyBypass = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/main-db');
        
        // Find an active class
        const cls = await FinalClass.findOne({ status: FINAL_CLASS_STATUS.ACTIVE }).populate('coordinator');
        if (!cls) {
            console.log('No active final class found for testing.');
            await mongoose.connection.close();
            return;
        }

        console.log(`Testing with class: ${cls._id}`);
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 20); // 20 days ago (window is 2)

        try {
            console.log('\nTrying to mark attendance for past date as TUTOR (should fail)...');
            await addDailyAttendance({
                finalClassId: String(cls._id),
                sessionDate: pastDate,
                durationHours: 1,
                topicCovered: 'Test',
                userId: String(cls.tutor as any),
                userRole: USER_ROLES.TUTOR
            });
            console.log('FAILED: Should have thrown error for Tutor');
        } catch (err: any) {
            console.log(`SUCCESS: Got expected error: ${err.message}`);
        }

        try {
            console.log('\nTrying to mark attendance for past date as COORDINATOR (should SUCCEED)...');
            await addDailyAttendance({
                finalClassId: String(cls._id),
                sessionDate: pastDate,
                durationHours: 1,
                topicCovered: 'Test Coordinator Bypass',
                userId: String((cls.coordinator as any)?._id || (cls as any).createdBy),
                userRole: USER_ROLES.COORDINATOR
            });
            console.log('SUCCESS: Coordinator bypassed window check!');
        } catch (err: any) {
            console.log(`FAILED: Coordinator should have bypassed: ${err.message}`);
        }

        await mongoose.connection.close();
    } catch (err) {
        console.error('Error during verification:', err);
        process.exit(1);
    }
};

verifyBypass();
