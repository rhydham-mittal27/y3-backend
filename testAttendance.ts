import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FinalClass from './src/models/FinalClass';
import { addDailyAttendance } from './src/services/attendanceSheetService';
import AttendanceSheet from './src/models/AttendanceSheet';

// We need User model to find a coordinator
// Assuming User model is at src/models/User.ts (default export or named?)
// checking file structure... usually src/models/User.ts
const User = require('./src/models/User').default;

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        // Find ANY active class
        let finalClass = await FinalClass.findOne({ status: 'ACTIVE' }).populate('coordinator tutor');
        
        if (!finalClass) {
            console.log('No active class found');
            return;
        }
        console.log('Found Class:', finalClass._id, 'Student:', finalClass.studentName);
        console.log('Coordinator:', finalClass.coordinator ? (finalClass.coordinator as any)._id : 'None');
        console.log('Tutor:', finalClass.tutor ? (finalClass.tutor as any)._id : 'None');

        if (!finalClass.coordinator || !finalClass.tutor) {
             console.log('Missing coordinator or tutor. Assigning defaults...');
             const admin = await User.findOne({ role: 'ADMIN' });
             const tutor = await User.findOne({ role: 'TUTOR' }) || admin;
             const coordinator = await User.findOne({ role: 'COORDINATOR' }) || admin;
             
             if (!admin && !tutor && !coordinator) {
                 console.log('No users found to assign.');
                 return;
             }

             if (!finalClass.coordinator) finalClass.coordinator = coordinator._id;
             if (!finalClass.tutor) finalClass.tutor = tutor._id;
             
             await finalClass.save();
             console.log('Assigned Coordinator:', finalClass.coordinator, 'Tutor:', finalClass.tutor);
             // Re-fetch to populate
             finalClass = await FinalClass.findById(finalClass._id).populate('coordinator tutor');
        }

        const sessionDate = new Date();
        // Ensure userId is valid string
        const userId = (finalClass!.tutor as any)._id.toString(); 

        const sheet = await addDailyAttendance({
            finalClassId: finalClass!._id.toString(),
            sessionDate,
            studentAttendanceStatus: 'PRESENT',
            topicCovered: 'Test Topic Refactor',
            notes: 'Test Note Refactor',
            userId
        });

        console.log('Attendance Sheet Updated:', sheet._id);
        console.log('Month:', sheet.month, 'Year:', sheet.year);
        console.log('Records Count:', sheet.records.length);
        const record = sheet.records.find(r => new Date(r.sessionDate).toDateString() === sessionDate.toDateString());
        console.log('Today Record Topic:', record?.topicCovered);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

test();
