import mongoose from 'mongoose';
import Tutor from '../models/Tutor';
import AttendanceSheet from '../models/AttendanceSheet';
import Attendance from '../models/Attendance';
import User from '../models/User';
import Option from '../models/Option';
import dotenv from 'dotenv';
import path from 'path';

// Fix for unused imports causing TS errors during npx ts-node
const dummyUser = User;
const dummyOption = Option;
if (dummyUser && dummyOption) {
    // console.log('Models registered');
}

dotenv.config({ path: path.join(__dirname, '../../.env') });

const verifyTutorHours = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/main-db';
        console.log('Connecting to:', mongoURI);
        await mongoose.connect(mongoURI);
        console.log('--- Tutor Hours Verification Report ---\n');

        const tutors = await Tutor.find().populate('user', 'name');
        console.log(`Found ${tutors.length} tutors.`);
        
        for (const tutor of tutors) {
            const userId = tutor.user?._id;
            if (!userId) {
                console.log(`[SKIP] Tutor ${tutor._id} has no user reference.`);
                continue;
            }
            const tutorName = (tutor.user as any)?.name || 'Unknown';

            // 1. Calculate from AttendanceSheet (New)
            const sheetAgg = await AttendanceSheet.aggregate([
                { $unwind: '$records' },
                { $match: { 'records.tutor': userId } },
                { $group: { _id: null, total: { $sum: '$records.durationHours' } } }
            ]);
            const sheetHours = sheetAgg[0]?.total || 0;

            // 2. Calculate from Attendance (Legacy)
            const attendanceAgg = await Attendance.aggregate([
                { $match: { tutor: userId } },
                { 
                    $lookup: { 
                        from: 'finalclasses', 
                        localField: 'finalClass', 
                        foreignField: '_id', 
                        as: 'cl' 
                    } 
                },
                { $unwind: { path: '$cl', preserveNullAndEmptyArrays: true } },
                { 
                    $lookup: { 
                        from: 'classleads', 
                        localField: 'cl.classLead', 
                        foreignField: '_id', 
                        as: 'ld' 
                    } 
                },
                { $unwind: { path: '$ld', preserveNullAndEmptyArrays: true } },
                { $group: { _id: null, total: { $sum: '$ld.classDurationHours' } } }
            ]);
            const legacyHours = attendanceAgg[0]?.total || 0;

            const totalCalculated = sheetHours + legacyHours;
            const storedHours = tutor.experienceHours || 0;

            if (storedHours !== totalCalculated) {
                console.log(`[MISMATCH] ${tutorName}`);
                console.log(`  Stored: ${storedHours}`);
                console.log(`  Calculated: ${totalCalculated} (Sheets: ${sheetHours}, Legacy: ${legacyHours})`);
                console.log(`  Difference: ${totalCalculated - storedHours}`);
                console.log('-----------------------------------');
            } else {
                console.log(`[OK] ${tutorName}: ${storedHours}h`);
            }
        }

        console.log('\nVerification Complete.');
        await mongoose.connection.close();
    } catch (err) {
        console.error('Error during verification:', err);
        process.exit(1);
    }
};

verifyTutorHours();
