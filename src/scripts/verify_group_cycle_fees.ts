
import mongoose from 'mongoose';
import { createCyclePayments } from '../services/paymentService';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Student from '../models/Student';
import AttendanceSheet from '../models/AttendanceSheet';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const verifyGroupCycleFees = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const mockId = new mongoose.Types.ObjectId();
    const tutorId = new mongoose.Types.ObjectId(); 

    // 1. Create Mock Group Class
    const finalClass = await FinalClass.create({
      className: 'GROUP-CYCLE-TEST-' + Date.now(),
      status: 'ACTIVE',
      monthlyFees: 8000,
      classesPerMonth: 8,
      ratePerSession: 1000,
      tutor: tutorId,
      classLead: mockId,
      coordinator: mockId,
      createdBy: mockId,
      startDate: new Date(),
      subject: ['Math'],
      grade: 'Grade 10',
      board: 'CBSE',
      mode: 'ONLINE',
      studentName: 'Group Students',
      convertedBy: mockId
    });
    console.log(`Created Group Class: ${finalClass._id}`);

    // 2. Create 2 Students linked to this class
    const student1 = await Student.create({
        studentId: 'ST-G1-' + Date.now(),
        name: 'Group Student 1',
        gender: 'M',
        grade: 'Grade 10',
        finalClass: finalClass._id,
        classLead: mockId,
        password: 'password123'
    });
    const student2 = await Student.create({
        studentId: 'ST-G2-' + Date.now(),
        name: 'Group Student 2',
        gender: 'F',
        grade: 'Grade 10',
        finalClass: finalClass._id,
        classLead: mockId,
        password: 'password123'
    });
    console.log(`Created 2 Students: ${student1._id}, ${student2._id}`);

    // --- TEST CYCLE 1 (Should be skipped) ---
    const sheet1 = await AttendanceSheet.create({
      finalClass: finalClass._id,
      month: 1,
      year: 2026,
      cycleNumber: 1,
      periodLabel: 'Cycle 1',
      status: 'DRAFT',
      createdBy: mockId,
      totalSessionsPlanned: 8
    });
    
    console.log('Running createCyclePayments for Cycle 1...');
    await createCyclePayments(String(sheet1._id), String(mockId));
    
    const payments1 = await Payment.find({ attendanceSheet: sheet1._id, paymentType: 'FEES_COLLECTED' });
    if (payments1.length === 0) {
        console.log('SUCCESS: No payments created for Cycle 1 (Correctly skipped).');
    } else {
        console.error(`FAILED: ${payments1.length} payments created for Cycle 1 (Expected 0).`);
    }

    // --- TEST CYCLE 2 (Should create 2 split payments) ---
    const sheet2 = await AttendanceSheet.create({
      finalClass: finalClass._id,
      month: 2,
      year: 2026,
      cycleNumber: 2,
      periodLabel: 'Cycle 2',
      status: 'DRAFT',
      createdBy: mockId,
      totalSessionsPlanned: 8
    });

    console.log('Running createCyclePayments for Cycle 2...');
    await createCyclePayments(String(sheet2._id), String(mockId));

    const payments2 = await Payment.find({ attendanceSheet: sheet2._id, paymentType: 'FEES_COLLECTED' });
    
    if (payments2.length === 2) {
        console.log('SUCCESS: 2 FEES_COLLECTED payments created for Cycle 2.');
        
        const amount = payments2[0].amount;
        const expected = 4000; // 8000 / 2
        if (amount === expected) {
             console.log(`SUCCESS: Payment amount is correct (${amount}).`);
        } else {
             console.error(`FAILED: Payment amount incorrect. Got ${amount}, expected ${expected}.`);
        }
        
        // precise check if both students have payment
        const s1Pay = payments2.find(p => String(p.student) === String(student1._id));
        const s2Pay = payments2.find(p => String(p.student) === String(student2._id));
        
        if (s1Pay && s2Pay) {
            console.log('SUCCESS: Payments linked correctly to individual students.');
        } else {
            console.error('FAILED: Payments not linked to correct students.');
        }

    } else {
        console.error(`FAILED: ${payments2.length} payments created for Cycle 2 (Expected 2).`);
    }

    // Cleanup
    await Payment.deleteMany({ finalClass: finalClass._id });
    await AttendanceSheet.deleteMany({ finalClass: finalClass._id });
    await Student.deleteMany({ finalClass: finalClass._id });
    await FinalClass.findByIdAndDelete(finalClass._id);
    
    console.log('Cleanup complete.');

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    await mongoose.disconnect();
  }
};

verifyGroupCycleFees();
