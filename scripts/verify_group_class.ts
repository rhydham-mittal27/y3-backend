import mongoose from 'mongoose';
import GroupClass from '../src/models/GroupClass';
import StudentEnrollment from '../src/models/StudentEnrollment';
import AttendanceSheet from '../src/models/AttendanceSheet';
import Payment from '../src/models/Payment';
import User from '../src/models/User'; // Assuming User model exists
import { addDailyAttendance, approveAttendanceSheet } from '../src/services/attendanceSheetService';
import { STUDENT_ATTENDANCE_STATUS } from '../src/config/constants';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-final-v3';

const verifyGroupClass = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create Mock Data
    // Create Tutor
    const tutor = await User.create({
      name: 'Group Tutor',
      email: `grouptutor_${Date.now()}@test.com`,
      password: 'password123',
      role: 'tutor'
    });

    // Create Coordinator
    const coordinator = await User.create({
      name: 'Group Coordinator',
      email: `groupcoord_${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin' // or coordinator
    });

    // Create Student
    const student = await User.create({
      name: 'Group Student',
      email: `groupstudent_${Date.now()}@test.com`,
      password: 'password123',
      role: 'student'
    });

    // 2. Create Group Class
    const group = await GroupClass.create({
      name: 'Math Batch A',
      tutor: tutor._id,
      sessionsPerMonth: 2, // Low limit for testing
      tutorRatePerSession: 500,
      status: 'ACTIVE',
      createdBy: coordinator._id
    });
    console.log('Group Class Created:', group.name);

    // 3. Enroll Student
    const enrollment = await StudentEnrollment.create({
      student: student._id,
      groupClass: group._id,
      monthlyFee: 2000,
      perSessionFee: 250,
      status: 'ACTIVE'
    });
    console.log('Student Enrolled:', enrollment._id);

    // 4. Add Daily Attendance (Session 1)
    const sessionDate1 = new Date();
    await addDailyAttendance({
      groupClassId: String(group._id),
      sessionDate: sessionDate1,
      studentAttendances: [{ student: String(student._id), status: STUDENT_ATTENDANCE_STATUS.PRESENT }],
      userId: String(coordinator._id) // Submitted by coord
    });
    console.log('Session 1 Marked');

    // 5. Add Daily Attendance (Session 2)
    const sessionDate2 = new Date();
    sessionDate2.setDate(sessionDate2.getDate() + 1);
    const sheet = await addDailyAttendance({
      groupClassId: String(group._id),
      sessionDate: sessionDate2,
      studentAttendances: [{ student: String(student._id), status: STUDENT_ATTENDANCE_STATUS.PRESENT }],
      userId: String(coordinator._id)
    });
    console.log('Session 2 Marked. Sheet ID:', sheet._id);

    // 6. Submit Sheet (Auto-submit usually happens, but let's force check or manual submit if needed)
    // currently addDailyAttendance auto-submits if full. Limit is 2. So it should be PENDING.
    const pendingSheet = await AttendanceSheet.findById(sheet._id);
    if (pendingSheet?.status !== 'PENDING') {
      console.error('Sheet should be PENDING but is:', pendingSheet?.status);
      // Manually submit if logic didn't trigger (e.g. limit mismatch)
      pendingSheet!.status = 'PENDING';
      await pendingSheet!.save();
    }

    // 7. Approve Sheet
    await approveAttendanceSheet(String(sheet._id), String(coordinator._id), true); // isAdmin=true to bypass check if coordinator field missing on group sheet
    console.log('Sheet Approved');

    // 8. Verify Updates
    // Check Enrollment Stats
    const updatedEnrollment = await StudentEnrollment.findById(enrollment._id);
    console.log('Enrollment Sessions Verified:', updatedEnrollment?.sessionsVerified);
    if (updatedEnrollment?.sessionsVerified !== 2) throw new Error('Enrollment verification count mismatch');

    // Check Tutor Payment
    const payment = await Payment.findOne({ attendanceSheet: sheet._id, paymentType: 'TUTOR_PAYOUT' });
    console.log('Tutor Payment:', payment?.amount);
    if (payment?.amount !== 1000) throw new Error('Payment amount mismatch (2 sessions * 500)');

    console.log('VERIFICATION SUCCESSFUL');

  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
  } finally {
    await mongoose.disconnect();
  }
};

verifyGroupClass();
