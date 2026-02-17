
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FinalClass from './src/models/FinalClass';
import AttendanceSheet from './src/models/AttendanceSheet';
import { addDailyAttendance } from './src/services/attendanceSheetService';
import User from './src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys_v3_dev';

const runTest = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // 1. Create a Test Class with strict session limit
    const coordinator = await User.findOne({ role: 'COORDINATOR' });
    const tutor = await User.findOne({ role: 'TUTOR' });
    const classLeadId = new mongoose.Types.ObjectId(); // Random ID to avoid unique constraint collision

    if (!coordinator || !tutor) {
      console.error('Coordinator or Tutor not found');
      process.exit(1);
    }

    const testClassName = `TestCycleClass_${Date.now()}`;
    const finalClass = await FinalClass.create({
      className: testClassName,
      classLead: classLeadId,
      tutor: tutor._id,
      coordinator: coordinator._id,
      startDate: new Date(),
      status: 'ACTIVE',
      studentName: 'Test Student Cycle',
      subject: ['Math'],
      grade: '10',
      board: 'CBSE',
      mode: 'ONLINE',
      convertedBy: coordinator._id,
      classesPerMonth: 3, // LIMIT IS 3
      attendanceSubmissionWindow: 100, // relaxed for testing
    });

    console.log(`Created Class: ${testClassName} with classesPerMonth=3`);

    // 2. Add 3 records (Filling the first sheet)
    console.log('Adding 3 records...');
    const userId = tutor._id.toString();
    
    const today = new Date();
    const d1 = new Date(today); d1.setDate(today.getDate() - 3);
    const d2 = new Date(today); d2.setDate(today.getDate() - 2);
    const d3 = new Date(today); d3.setDate(today.getDate() - 1);
    const d4 = new Date(today); // Today

    await addDailyAttendance({
      finalClassId: finalClass._id.toString(),
      sessionDate: d1,
      studentAttendanceStatus: 'PRESENT',
      userId,
      topicCovered: 'Session 1'
    });
    await addDailyAttendance({
      finalClassId: finalClass._id.toString(),
      sessionDate: d2,
      studentAttendanceStatus: 'PRESENT',
      userId,
      topicCovered: 'Session 2'
    });
    await addDailyAttendance({
      finalClassId: finalClass._id.toString(),
      sessionDate: d3,
      studentAttendanceStatus: 'PRESENT',
      userId,
      topicCovered: 'Session 3'
    });

    // 3. Verify Sheet 1
    const sheets1 = await AttendanceSheet.find({ finalClass: finalClass._id }).sort({ cycleNumber: 1 });
    console.log(`Sheets after 3 records: ${sheets1.length}`);
    const sheet1 = sheets1[0];
    
    if (sheets1.length !== 1) throw new Error('Expected exactly 1 sheet');
    if (sheet1.records.length !== 3) throw new Error(`Expected 3 records in sheet 1, got ${sheet1.records.length}`);
    if (sheet1.status !== 'PENDING') throw new Error(`Expected Sheet 1 to be PENDING (Auto-submit), got ${sheet1.status}`);
    console.log('Sheet 1 Verified: Full and PENDING.');

    // 4. Add 4th record (Should start new sheet)
    console.log('Adding 4th record...');
    await addDailyAttendance({
      finalClassId: finalClass._id.toString(),
      sessionDate: d4,
      studentAttendanceStatus: 'PRESENT',
      userId,
      topicCovered: 'Session 4 (Cycle 2)'
    });

    // 5. Verify Sheet 2
    const sheets2 = await AttendanceSheet.find({ finalClass: finalClass._id }).sort({ cycleNumber: 1 });
    console.log(`Sheets after 4 records: ${sheets2.length}`);
    
    if (sheets2.length !== 2) throw new Error('Expected exactly 2 sheets');
    const sheet2 = sheets2[1];
    
    if (sheet2.cycleNumber !== 2) throw new Error(`Expected Sheet 2 to have cycleNumber 2, got ${sheet2.cycleNumber}`);
    if (sheet2.records.length !== 1) throw new Error(`Expected 1 record in sheet 2, got ${sheet2.records.length}`);
    if (sheet2.status !== 'DRAFT') throw new Error(`Expected Sheet 2 to be DRAFT, got ${sheet2.status}`);
    
    console.log('Sheet 2 Verified: New Cycle Started.');

    console.log('TEST PASSED SUCCESSFULLY');

    // Cleanup
    await AttendanceSheet.deleteMany({ finalClass: finalClass._id });
    await FinalClass.findByIdAndDelete(finalClass._id);

  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

runTest();
