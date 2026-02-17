
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import FinalClass from './src/models/FinalClass';
import AttendanceSheet from './src/models/AttendanceSheet';
import { addDailyAttendance, updateDailyAttendance } from './src/services/attendanceSheetService';
import { STUDENT_ATTENDANCE_STATUS } from './src/config/constants';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_shikshak_v3';

const run = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Create a dummy FinalClass
        const finalClass = await FinalClass.create({
            tutor: new mongoose.Types.ObjectId(),
            student: new mongoose.Types.ObjectId(),
            coordinator: new mongoose.Types.ObjectId(),
            className: 'Test Class Duplicate',
            subject: ['Math'],
            grade: '10',
            status: 'ACTIVE',
            classesPerMonth: 8,
            demoClass: new mongoose.Types.ObjectId(), // dummy
            startSessionDate: new Date(),
            schedule: { daysOfWeek: ['MONDAY', 'WEDNESDAY'], timeSlot: '10:00 AM' },
            classLead: new mongoose.Types.ObjectId(),
            finalClassId: 'TEST-DUP-001'
        });
        console.log('Created FinalClass:', finalClass._id);

        const userId = new mongoose.Types.ObjectId().toString();
        const date = new Date();

        // 2. Add Attendance (Should succeed)
        console.log('Adding first attendance...');
        await addDailyAttendance({
             finalClassId: finalClass._id.toString(),
             sessionDate: date,
             durationHours: 1,
             topicCovered: 'Algebra',
             studentAttendanceStatus: STUDENT_ATTENDANCE_STATUS.PRESENT,
             userId: userId
        });
        console.log('First attendance added.');

        // 3. Add Duplicate Attendance (Should fail)
        console.log('Adding duplicate attendance...');
        try {
            await addDailyAttendance({
                finalClassId: finalClass._id.toString(),
                sessionDate: date, // Same date
                durationHours: 1.5,
                topicCovered: 'Algebra 2',
                studentAttendanceStatus: STUDENT_ATTENDANCE_STATUS.PRESENT,
                userId: userId
           });
           console.error('FAILED: Duplicate attendance was allowed!');
        } catch (e: any) {
            console.log('SUCCESS: Duplicate attendance failed as expected:', e.message);
        }

        // 4. Update Attendance (Should succeed)
        const sheet = await AttendanceSheet.findOne({ finalClass: finalClass._id });
        if(sheet && sheet.records.length > 0) {
             const recordId = sheet.records[0]._id as string;
             console.log('Updating attendance record:', recordId);
             await updateDailyAttendance(String(recordId), {
                 topicCovered: 'Algebra Updated'
             });
             
             const updatedSheet = await AttendanceSheet.findById(sheet._id);
             const updatedRecord = updatedSheet?.records[0];
             if(updatedRecord?.topicCovered === 'Algebra Updated') {
                 console.log('SUCCESS: Record updated.');
             } else {
                 console.error('FAILED: Record not updated.');
             }
        }

        // Cleanup
        await FinalClass.findByIdAndDelete(finalClass._id);
        await AttendanceSheet.deleteMany({ finalClass: finalClass._id });
        console.log('Cleanup done.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
