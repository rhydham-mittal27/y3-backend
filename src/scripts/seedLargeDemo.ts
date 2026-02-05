import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from '../models/User';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import Attendance from '../models/Attendance';
import Payment from '../models/Payment';
import Test from '../models/Test';
import {
  USER_ROLES,
  BOARD_TYPE,
  TEACHING_MODE,
  CLASS_LEAD_STATUS,
  VERIFICATION_STATUS,
  FINAL_CLASS_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  TEST_STATUS,
} from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedLargeDemo] Connected to MongoDB');
}

async function createUser(role: string) {
  const username = faker.internet.username().toLowerCase().replace(/[^a-z0-9]/g, '');
  const email = `${username || 'user'}@gmail.com`;
  const user = await User.create({
    name: faker.person.fullName(),
    email,
    password: 'Password@123',
    role,
    phone: '+91' + faker.string.numeric(10),
    isActive: true,
  } as any);
  return user;
}

async function main() {
  await connect();

  // --- Core users ---
  const manager = await createUser(USER_ROLES.MANAGER);
  const coordinator = await createUser(USER_ROLES.COORDINATOR);

  const tutors: any[] = [];
  const TUTORS_PER_SEED = 20;
  const CLASSES_PER_TUTOR = 10;

  // Known seed tutor for testing earnings UI
  const seedTutorUser = await User.create({
    name: 'Seed Tutor',
    email: 'tutorseed@gmail.com',
    password: 'Password@123',
    role: USER_ROLES.TUTOR,
    phone: '+911234567890',
    isActive: true,
  } as any);
  tutors.push(seedTutorUser);
  await Tutor.create({
    user: seedTutorUser._id,
    experienceHours: 300,
    subjects: ['Math', 'Science'],
    qualifications: ['B.Ed'],
    ratings: 4.5,
    totalRatings: 50,
    classesAssigned: 0,
    classesCompleted: 0,
    demosTaken: 0,
    demosApproved: 0,
    interestCount: 0,
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    documents: [],
    isAvailable: true,
    preferredMode: TEACHING_MODE.ONLINE,
    preferredLocations: ['Mumbai'],
    tier: 'BRONZE',
  } as any);

  // Additional random tutors
  for (let _i = 0; _i < TUTORS_PER_SEED - 1; _i++) {
    const u = await createUser(USER_ROLES.TUTOR);
    tutors.push(u);
    await Tutor.create({
      user: u._id,
      experienceHours: faker.number.int({ min: 50, max: 500 }),
      subjects: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
      qualifications: ['B.Ed'],
      ratings: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
      totalRatings: faker.number.int({ min: 0, max: 100 }),
      classesAssigned: 0,
      classesCompleted: 0,
      demosTaken: 0,
      demosApproved: 0,
      interestCount: 0,
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
      documents: [],
      isAvailable: true,
      preferredMode: TEACHING_MODE.ONLINE,
      preferredLocations: [faker.location.city()],
      tier: 'BRONZE',
    } as any);
  }

  // --- Class leads, final classes, attendance, payments, tests ---
  const leads: any[] = [];
  const finals: any[] = [];
  const attendances: any[] = [];
  const payments: any[] = [];
  const tests: any[] = [];

  const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  for (const tutorUser of tutors) {
    for (let _c = 0; _c < CLASSES_PER_TUTOR; _c++) {
      // Lead for this class
      const lead = await ClassLead.create({
        studentName: faker.person.firstName() + ' ' + faker.person.lastName(),
        grade: faker.helpers.arrayElement(['7', '8', '9', '10', '11', '12']),
        subject: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
        board: faker.helpers.arrayElement(Object.values(BOARD_TYPE) as string[]),
        mode: faker.helpers.arrayElement(Object.values(TEACHING_MODE) as string[]),
        location: faker.location.city(),
        timing: 'Daily 6PM',
        status: CLASS_LEAD_STATUS.CONVERTED,
        createdBy: manager._id,
        notes: 'Seeded lead for large demo',
      });
      leads.push(lead);

      // FinalClass for this lead/tutor
      const startDate = faker.date.recent({ days: 60 });
      const className = `${lead.studentName}-${lead.grade}-${(lead.subject?.[0] || 'GEN')}-${String(lead._id).slice(-4)}`;
      const finalClass = await FinalClass.create({
        className,
        classLead: lead._id,
        tutor: tutorUser._id,
        coordinator: coordinator._id,
        parent: undefined,
        startDate,
        status: faker.helpers.arrayElement([FINAL_CLASS_STATUS.ACTIVE, FINAL_CLASS_STATUS.COMPLETED]) as any,
        // 7 days a week schedule
        schedule: { daysOfWeek: DAYS_OF_WEEK, timeSlot: '18:00 - 19:00' },
        totalSessions: 10,
        completedSessions: faker.number.int({ min: 0, max: 10 }),
        studentName: lead.studentName,
        subject: lead.subject,
        grade: lead.grade,
        board: lead.board,
        mode: lead.mode,
        location: lead.location,
        convertedBy: manager._id,
        convertedAt: startDate,
        notes: 'Demo large seed final class',
      } as any);
      finals.push(finalClass);

      // Exactly 10 attendance records per class
      const classAttendances: any[] = [];
      for (let i = 0; i < 10; i++) {
        const sessionDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const status = i < 5
          ? faker.helpers.arrayElement(['COORDINATOR_APPROVED', 'PARENT_APPROVED']) as any
          : faker.helpers.arrayElement(['PENDING', 'COORDINATOR_APPROVED', 'PARENT_APPROVED']) as any;
        const att = await Attendance.create({
          finalClass: finalClass._id,
          sessionDate,
          sessionNumber: i + 1,
          tutor: tutorUser._id,
          coordinator: coordinator._id,
          status,
          submittedBy: tutorUser._id,
          submittedAt: sessionDate,
          notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
        } as any);
        attendances.push(att);
        classAttendances.push(att);
      }

      // Exactly 5 payments per class (based on first 5 sessions)
      for (let i = 0; i < 5; i++) {
        const a = classAttendances[i];
        const status = faker.helpers.arrayElement([
          PAYMENT_STATUS.PAID,
          PAYMENT_STATUS.PENDING,
        ]) as any;
        const paymentDate = status === PAYMENT_STATUS.PAID ? faker.date.recent({ days: 30 }) : undefined;
        const pay = await Payment.create({
          finalClass: finalClass._id,
          attendance: a._id,
          tutor: tutorUser._id,
          amount: faker.number.int({ min: 400, max: 1200 }),
          currency: 'INR',
          status,
          paymentMethod: PAYMENT_METHOD.UPI as any,
          transactionId: paymentDate ? `TXN${Date.now()}${String(a._id).slice(-4)}` : undefined,
          paymentDate,
          dueDate: faker.date.recent({ days: 45 }),
          createdBy: manager._id,
          notes: 'Seeded payment record',
        } as any);
        payments.push(pay);
      }

      // Exactly 2 tests per class
      for (let t = 0; t < 2; t++) {
        const testDate = new Date(startDate.getTime() + (t + 3) * 7 * 24 * 60 * 60 * 1000);
        const testDoc = await Test.create({
          finalClass: finalClass._id,
          tutor: tutorUser._id,
          coordinator: coordinator._id,
          testDate,
          testTime: '17:00',
          status: faker.helpers.arrayElement(Object.values(TEST_STATUS) as string[]) as any,
          scheduledBy: coordinator._id,
          scheduledAt: new Date(),
          notes: 'Seeded test',
        } as any);
        tests.push(testDoc);
      }
    }
  }

  console.log('[seedLargeDemo] Completed', {
    tutors: tutors.length,
    leads: leads.length,
    finals: finals.length,
    attendances: attendances.length,
    payments: payments.length,
    tests: tests.length,
    classesPerTutor: CLASSES_PER_TUTOR,
  });
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedLargeDemo] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
