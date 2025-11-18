import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
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

async function ensureTutorForUser(userId: mongoose.Types.ObjectId) {
  const existing = await Tutor.findOne({ user: userId });
  if (existing) return existing;
  const tutor = await Tutor.create({
    user: userId,
    experienceHours: 50,
    subjects: ['Math'],
    qualifications: ['B.Ed'],
    preferredMode: TEACHING_MODE.ONLINE,
    preferredLocations: ['Sample City'],
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    ratings: 4.5,
    totalRatings: 5,
    classesAssigned: 1,
    classesCompleted: 0,
    demosTaken: 0,
    demosApproved: 0,
    interestCount: 0,
    isAvailable: true,
    tier: 'BRONZE',
  } as any);
  return tutor;
}

async function seedSingleTutorWithClass() {
  await connect();

  try {
    // Core users
    const manager = await upsertUser('Seed Manager', 'seed.manager@example.com', USER_ROLES.MANAGER);
    const coordinator = await upsertUser('Seed Coordinator', 'seed.coordinator@example.com', USER_ROLES.COORDINATOR);
    const parent = await upsertUser('Seed Parent', 'seed.parent@example.com', USER_ROLES.PARENT, '+910000000000');
    const tutorUser = await upsertUser('Seed Tutor', 'seed.tutor@example.com', USER_ROLES.TUTOR, '+919999999999');

    // Tutor profile
    const tutorProfile = await ensureTutorForUser(tutorUser._id);

    // Class lead for this tutor
    const lead = await ClassLead.create({
      studentName: 'Seeded Student',
      grade: '8',
      subject: ['Math'],
      board: BOARD_TYPE.CBSE,
      mode: TEACHING_MODE.ONLINE,
      location: 'Sample City',
      timing: 'Mon-Wed-Fri 6:00 PM',
      status: CLASS_LEAD_STATUS.CONVERTED,
      createdBy: manager._id,
      notes: 'Seeded lead for single active class',
      assignedTutor: tutorUser._id,
    } as any);

    // Single ACTIVE final class
    const finalClass = await FinalClass.create({
      classLead: lead._id,
      tutor: tutorUser._id,
      coordinator: coordinator._id,
      parent: parent._id,
      startDate: new Date(),
      status: 'ACTIVE' as any,
      schedule: { daysOfWeek: ['Mon', 'Wed', 'Fri'], timeSlot: '18:00-19:00' },
      totalSessions: 12,
      completedSessions: 0,
      studentName: lead.studentName,
      subject: lead.subject,
      grade: lead.grade,
      board: lead.board,
      mode: lead.mode,
      location: lead.location,
      convertedBy: manager._id,
    } as any);

    console.log('Seeded single tutor with one active class:', {
      tutorUserId: tutorUser.id,
      tutorEmail: tutorUser.email,
      tutorProfileId: tutorProfile.id,
      classLeadId: lead.id,
      finalClassId: finalClass.id,
    });
  } finally {
    await mongoose.disconnect();
  }
}

seedSingleTutorWithClass().catch((err) => {
  console.error('Seed single tutor with class failed', err);
  process.exit(1);
});
