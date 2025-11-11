import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';
import Announcement from '../models/Announcement';
import FinalClass from '../models/FinalClass';
import Attendance from '../models/Attendance';
import Payment from '../models/Payment';
import DemoHistory from '../models/DemoHistory';
import Notification from '../models/Notification';
import Test from '../models/Test';
import TutorFeedback from '../models/TutorFeedback';
import { USER_ROLES, BOARD_TYPE, TEACHING_MODE, CLASS_LEAD_STATUS, VERIFICATION_STATUS } from '../config/constants';

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) {
    throw new Error('MONGO_URI (or DATABASE_URL) is not set in environment');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function upsertUser(name: string, email: string, role: string, phone?: string) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const user = new User({ name, email, password: 'Password@123', role, phone });
  await user.save();
  return user;
}

async function ensureTutorForUser(userId: mongoose.Types.ObjectId, seed: Partial<{
  experienceHours: number;
  subjects: string[];
  qualifications: string[];
  preferredMode: string;
  preferredLocations: string[];
  verificationStatus: string;
}> = {}) {
  const existing = await Tutor.findOne({ user: userId });
  if (existing) return existing;
  const tutor = await Tutor.create({
    user: userId,
    experienceHours: seed.experienceHours ?? 120,
    subjects: seed.subjects ?? ['Math', 'Science'],
    qualifications: seed.qualifications ?? ['B.Ed', 'M.Sc'],
    preferredMode: seed.preferredMode ?? TEACHING_MODE.ONLINE,
    preferredLocations: seed.preferredLocations ?? ['Mumbai', 'Thane'],
    verificationStatus: seed.verificationStatus ?? VERIFICATION_STATUS.UNDER_REVIEW,
    ratings: 4.2,
    totalRatings: 15,
    classesAssigned: 3,
    classesCompleted: 1,
    demosTaken: 5,
    demosApproved: 4,
    interestCount: 0,
    isAvailable: true,
    tier: 'BRONZE',
  } as any);
  return tutor;
}

async function seed() {
  await connect();

  // Core users
  const admin = await upsertUser('Alice Admin', 'admin@example.com', USER_ROLES.ADMIN);
  const manager = await upsertUser('Mark Manager', 'manager@example.com', USER_ROLES.MANAGER);
  const coordinator = await upsertUser('Cory Coordinator', 'coordinator@example.com', USER_ROLES.COORDINATOR);
  const tutorUser1 = await upsertUser('Tina Tutor', 'tutor1@example.com', USER_ROLES.TUTOR, '+911234567890');
  const tutorUser2 = await upsertUser('Tom Tutor', 'tutor2@example.com', USER_ROLES.TUTOR, '+919876543210');
  const parentUser = await upsertUser('Priya Parent', 'parent@example.com', USER_ROLES.PARENT, '+919111111111');

  // Tutor profiles
  const tutor1 = await ensureTutorForUser(tutorUser1._id, {
    subjects: ['Math', 'Physics'],
    experienceHours: 320,
    preferredMode: TEACHING_MODE.HYBRID,
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    preferredLocations: ['Andheri', 'Bandra'],
  });
  const tutor2 = await ensureTutorForUser(tutorUser2._id, {
    subjects: ['Chemistry', 'Biology'],
    experienceHours: 210,
    preferredMode: TEACHING_MODE.ONLINE,
    verificationStatus: VERIFICATION_STATUS.PENDING,
    preferredLocations: ['Borivali', 'Thane'],
  });

  // Class leads created by manager
  const lead1 = await ClassLead.create({
    studentName: 'Rahul Sharma',
    grade: '9',
    subject: ['Math', 'Science'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    location: 'Powai',
    timing: 'Mon-Wed-Fri 6:00 PM',
    status: CLASS_LEAD_STATUS.ANNOUNCED,
    createdBy: manager._id,
    notes: 'Prefers evening slots'
  });

  const lead2 = await ClassLead.create({
    studentName: 'Aarav Singh',
    grade: '10',
    subject: ['Physics'],
    board: BOARD_TYPE.ICSE,
    mode: TEACHING_MODE.HYBRID,
    location: 'Bandra',
    timing: 'Tue-Thu 7:30 PM',
    status: CLASS_LEAD_STATUS.NEW,
    createdBy: manager._id,
  });

  // Announcements with interested tutors
  const ann1 = await Announcement.create({
    classLead: lead1._id,
    postedBy: coordinator._id,
    postedAt: new Date(),
    interestedTutors: [
      { tutor: tutorUser1._id, interestedAt: new Date(Date.now() - 1000 * 60 * 60) },
      { tutor: tutorUser2._id, interestedAt: new Date() },
    ],
    isActive: true,
  });

  // Another announcement without interests yet
  const ann2 = await Announcement.create({
    classLead: lead2._id,
    postedBy: coordinator._id,
    postedAt: new Date(),
    interestedTutors: [],
    isActive: true,
  });

  // Convert lead1 to a FinalClass assigned to tutor1
  const finalClass1 = await FinalClass.create({
    classLead: lead1._id,
    tutor: tutorUser1._id,
    coordinator: coordinator._id,
    parent: parentUser._id,
    startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    status: 'ACTIVE' as any,
    schedule: { daysOfWeek: ['Mon', 'Wed', 'Fri'], timeSlot: '18:00-19:00' },
    totalSessions: 12,
    completedSessions: 5,
    studentName: lead1.studentName,
    subject: lead1.subject,
    grade: lead1.grade,
    board: lead1.board,
    mode: lead1.mode,
    location: lead1.location,
    convertedBy: manager._id,
    notes: 'Converted from announcement'
  });

  // Attendance for some sessions
  const sessions = [1,2,3,4,5].map((n) => ({
    finalClass: finalClass1._id,
    sessionDate: new Date(Date.now() - (6 - n) * 24 * 60 * 60 * 1000),
    sessionNumber: n,
    tutor: tutorUser1._id,
    coordinator: coordinator._id,
    parent: parentUser._id,
    status: n <= 4 ? 'COORDINATOR_APPROVED' : 'PENDING',
    submittedBy: tutorUser1._id,
    notes: n === 5 ? 'Awaiting approval' : undefined,
  }));
  const attendances = await Attendance.insertMany(sessions as any[]);

  // Payments for approved attendances
  const payments = await Payment.insertMany((attendances as any[])
    .filter((a: any) => a.status === 'COORDINATOR_APPROVED')
    .map((a: any, idx: number) => ({
      finalClass: finalClass1._id,
      attendance: a._id,
      tutor: tutorUser1._id,
      amount: 500,
      currency: 'INR',
      status: idx < 2 ? 'PAID' : 'PENDING',
      paymentMethod: idx < 2 ? 'UPI' : undefined,
      transactionId: idx < 2 ? `TXN${Date.now()}${idx}` : undefined,
      paymentDate: idx < 2 ? new Date(a.sessionDate.getTime() + 12 * 60 * 60 * 1000) : undefined,
      dueDate: new Date(a.sessionDate.getTime() + 24 * 60 * 60 * 1000),
      createdBy: manager._id,
      notes: idx < 2 ? 'Paid on time' : 'Auto-generated pending payment',
    })) as any);

  // Demo history for lead2
  const demoAssign = await DemoHistory.create({
    classLead: lead2._id,
    tutor: tutorUser2._id,
    demoDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    demoTime: '19:30',
    status: 'SCHEDULED' as any,
    assignedBy: coordinator._id,
  });

  // Test scheduled for finalClass1
  const test1 = await Test.create({
    finalClass: finalClass1._id,
    tutor: tutorUser1._id,
    coordinator: coordinator._id,
    testDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    testTime: '17:00',
    status: 'SCHEDULED' as any,
    scheduledBy: coordinator._id,
  });

  // Tutor feedback for last month
  const monthStr = new Date().toISOString().slice(0,7);
  await TutorFeedback.create({
    tutor: tutorUser1._id,
    finalClass: finalClass1._id,
    submittedBy: parentUser._id,
    submitterRole: 'PARENT',
    month: monthStr,
    overallRating: 5,
    teachingQuality: 5,
    punctuality: 4,
    communication: 5,
    subjectKnowledge: 5,
    comments: 'Excellent teaching and punctuality.',
    strengths: 'Clarity, patience',
    improvements: 'More practice sheets',
    wouldRecommend: true,
  });

  // Notifications
  await Notification.insertMany([
    { recipient: tutorUser1._id, type: 'ANNOUNCEMENT', title: 'New class announcement', message: 'A new class lead has been announced', relatedClassLead: lead1._id },
    { recipient: tutorUser1._id, type: 'PAYMENT', title: 'Payment received', message: 'Your payment has been processed', },
    { recipient: coordinator._id, type: 'ATTENDANCE', title: 'Approval pending', message: 'An attendance entry needs your approval', relatedClassLead: lead1._id },
  ] as any[]);

  console.log('Seed complete:');
  console.log({
    admin: admin.email,
    manager: manager.email,
    coordinator: coordinator.email,
    tutor1: tutorUser1.email,
    tutor2: tutorUser2.email,
    leadIds: [lead1.id, lead2.id],
    announcementIds: [ann1.id, ann2.id],
    finalClassId: finalClass1.id,
    attendanceIds: attendances.map((a: any) => a.id),
    paymentIds: payments.map((p: any) => p.id),
    testId: test1.id,
  });
}

seed()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Seed failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
