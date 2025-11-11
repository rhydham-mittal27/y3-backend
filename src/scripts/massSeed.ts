import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from '../models/User';
import Tutor from '../models/Tutor';
import Manager from '../models/Manager';
import Coordinator from '../models/Coordinator';
import ClassLead from '../models/ClassLead';
import Announcement from '../models/Announcement';
import FinalClass from '../models/FinalClass';
import Attendance from '../models/Attendance';
import Payment from '../models/Payment';
import DemoHistory from '../models/DemoHistory';
import Notification from '../models/Notification';
import Test from '../models/Test';
import TutorFeedback from '../models/TutorFeedback';
import CoordinatorAnnouncement from '../models/CoordinatorAnnouncement';
import { USER_ROLES, BOARD_TYPE, TEACHING_MODE, CLASS_LEAD_STATUS, VERIFICATION_STATUS, FINAL_CLASS_STATUS, ATTENDANCE_STATUS, PAYMENT_STATUS, PAYMENT_METHOD, DEMO_STATUS, TEST_STATUS } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

// Target volumes
const COUNTS = {
  managers: 10,
  coordinators: 10,
  tutors: 220,
  parents: 80,
  leads: 150,
  announcements: 150,
  finals: 90, // ~60% of leads
  attendance: 150,
  payments: 150,
  demos: 150,
  tests: 150,
  feedbacks: 150,
  notifications: 150,
  coordinatorAnnouncements: 150,
};

const randPastDays = (maxDays = 7) => {
  const d = new Date();
  const offset = Math.floor(Math.random() * maxDays);
  d.setDate(d.getDate() - offset);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return d;
};

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function createUser(role: string): Promise<any> {
  const email = faker.internet.email().toLowerCase();
  const user = await User.create({
    name: faker.person.fullName(),
    email,
    password: 'Password@123',
    role,
    phone: '+91' + faker.string.numeric(10),
    isActive: true,
    createdAt: randPastDays(7),
    updatedAt: new Date(),
  } as any);
  return user;
}

async function ensureUsers() {
  const admins: any[] = [];
  const managers: any[] = [];
  const coordinators: any[] = [];
  const tutors: any[] = [];
  const parents: any[] = [];

  // One admin
  admins.push(await createUser(USER_ROLES.ADMIN));
  // Bulk
  for (let i = 0; i < COUNTS.managers; i++) managers.push(await createUser(USER_ROLES.MANAGER));
  for (let i = 0; i < COUNTS.coordinators; i++) coordinators.push(await createUser(USER_ROLES.COORDINATOR));
  for (let i = 0; i < COUNTS.tutors; i++) tutors.push(await createUser(USER_ROLES.TUTOR));
  for (let i = 0; i < COUNTS.parents; i++) parents.push(await createUser(USER_ROLES.PARENT));

  return { admins, managers, coordinators, tutors, parents };
}

async function ensureProfiles(users: { managers: any[]; coordinators: any[]; tutors: any[] }) {
  const managerDocs: any[] = [];
  const coordinatorDocs: any[] = [];
  const tutorDocs: any[] = [];

  for (const mu of users.managers) {
    managerDocs.push(
      await Manager.create({
        user: mu._id,
        classLeadsCreated: faker.number.int({ min: 10, max: 100 }),
        demosScheduled: faker.number.int({ min: 5, max: 50 }),
        classesConverted: faker.number.int({ min: 1, max: 30 }),
        revenueGenerated: faker.number.int({ min: 10000, max: 200000 }),
        tutorsVerified: faker.number.int({ min: 0, max: 20 }),
        coordinatorsCreated: faker.number.int({ min: 0, max: 5 }),
        paymentsProcessed: faker.number.int({ min: 0, max: 50 }),
        isActive: true,
        joiningDate: randPastDays(200),
      })
    );
  }

  for (const cu of users.coordinators) {
    coordinatorDocs.push(
      await Coordinator.create({
        user: cu._id,
        assignedClasses: [],
        maxClassCapacity: faker.number.int({ min: 5, max: 20 }),
        activeClassesCount: 0,
        totalClassesHandled: 0,
        specialization: [faker.helpers.arrayElement(['Math', 'Science', 'English', 'Physics'])],
        joiningDate: randPastDays(200),
        performanceScore: faker.number.int({ min: 50, max: 95 }),
        isActive: true,
      })
    );
  }

  for (const tu of users.tutors) {
    tutorDocs.push(
      await Tutor.create({
        user: tu._id,
        experienceHours: faker.number.int({ min: 50, max: 1000 }),
        subjects: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
        qualifications: faker.helpers.arrayElements(['B.Ed', 'M.Sc', 'B.Sc', 'M.A'], 2),
        ratings: faker.number.float({ min: 2, max: 5, fractionDigits: 1 }),
        totalRatings: faker.number.int({ min: 0, max: 100 }),
        classesAssigned: 0,
        classesCompleted: 0,
        demosTaken: faker.number.int({ min: 0, max: 20 }),
        demosApproved: faker.number.int({ min: 0, max: 20 }),
        interestCount: 0,
        verificationStatus: faker.helpers.arrayElement(Object.values(VERIFICATION_STATUS) as string[]),
        documents: [],
        isAvailable: true,
        preferredMode: faker.helpers.arrayElement(Object.values(TEACHING_MODE) as string[]),
        preferredLocations: [faker.location.city()],
        tier: 'BRONZE',
      } as any)
    );
  }

  return { managerDocs, coordinatorDocs, tutorDocs };
}

async function createLeads(managers: any[], count = COUNTS.leads) {
  const leads: any[] = [];
  for (let i = 0; i < count; i++) {
    const m = faker.helpers.arrayElement(managers);
    leads.push(
      await ClassLead.create({
        studentName: faker.person.firstName() + ' ' + faker.person.lastName(),
        grade: faker.helpers.arrayElement(['7', '8', '9', '10', '11', '12']),
        subject: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
        board: faker.helpers.arrayElement(Object.values(BOARD_TYPE) as string[]),
        mode: faker.helpers.arrayElement(Object.values(TEACHING_MODE) as string[]),
        location: faker.location.city(),
        timing: faker.helpers.arrayElement(['Mon-Wed-Fri 6PM', 'Tue-Thu 7PM', 'Weekend 5PM']),
        status: faker.helpers.arrayElement(Object.values(CLASS_LEAD_STATUS) as string[]),
        createdBy: m.user,
        notes: faker.lorem.sentence(),
        createdAt: randPastDays(7),
      })
    );
  }
  return leads;
}

async function createAnnouncements(leads: any[], coordinators: any[], tutorUsers: any[], count = COUNTS.announcements) {
  const anns: any[] = [];
  const source = leads.slice(0, Math.min(count, leads.length));
  for (const lead of source) {
    const coord = faker.helpers.arrayElement(coordinators);
    const interested = faker.helpers.arrayElements(tutorUsers, faker.number.int({ min: 1, max: 5 }));
    anns.push(
      await Announcement.create({
        classLead: lead._id,
        postedBy: coord.user,
        postedAt: randPastDays(7),
        interestedTutors: interested.map((u: any) => ({ tutor: u._id, interestedAt: randPastDays(7) })),
        isActive: true,
        createdAt: randPastDays(7),
      })
    );
  }
  return anns;
}

async function createFinalClasses(leads: any[], tutors: any[], coordinators: any[], managerUsers: any[], count = COUNTS.finals) {
  const finals: any[] = [];
  const convertCount = Math.min(count, Math.floor(leads.length * 0.8));
  const converting = faker.helpers.arrayElements(leads, convertCount);
  for (const lead of converting) {
    const tutorUser = faker.helpers.arrayElement(tutors);
    const coord = faker.helpers.arrayElement(coordinators);
    const managerUser = faker.helpers.arrayElement(managerUsers);
    const convertedAt = randPastDays(7);
    finals.push(
      await FinalClass.create({
        classLead: lead._id,
        tutor: tutorUser._id,
        coordinator: coord.user,
        parent: undefined,
        startDate: randPastDays(7),
        status: faker.helpers.arrayElement([FINAL_CLASS_STATUS.ACTIVE, FINAL_CLASS_STATUS.COMPLETED]) as any,
        schedule: { daysOfWeek: ['Mon', 'Wed', 'Fri'], timeSlot: '18:00-19:00' },
        totalSessions: faker.number.int({ min: 6, max: 20 }),
        completedSessions: faker.number.int({ min: 0, max: 10 }),
        studentName: lead.studentName,
        subject: lead.subject,
        grade: lead.grade,
        board: lead.board,
        mode: lead.mode,
        location: lead.location,
        convertedBy: managerUser._id,
        convertedAt,
        notes: 'Converted from lead',
        createdAt: convertedAt,
      } as any)
    );
  }
  return finals;
}

async function createAttendance(finals: any[], coordinators: any[], tutors: any[], count = COUNTS.attendance) {
  const items: any[] = [];
  // Distribute sessions across finals to avoid unique(finalClass, sessionDate) collisions
  for (let i = 0; i < count; i++) {
    const fc = finals[i % Math.max(1, finals.length)];
    const tutorUser = tutors.find((t: any) => String(t._id) === String(fc.tutor)) || faker.helpers.arrayElement(tutors);
    const coord = faker.helpers.arrayElement(coordinators);
    const status = faker.helpers.arrayElement([ATTENDANCE_STATUS.PENDING, ATTENDANCE_STATUS.COORDINATOR_APPROVED, ATTENDANCE_STATUS.PARENT_APPROVED]) as any;
    const sessionDate = new Date((fc.startDate || randPastDays(7)).getTime() + (i % 14) * 24 * 60 * 60 * 1000);
    items.push(
      await Attendance.create({
        finalClass: fc._id,
        sessionDate,
        sessionNumber: (i % 20) + 1,
        tutor: tutorUser._id,
        coordinator: coord.user,
        status,
        submittedBy: tutorUser._id,
        submittedAt: sessionDate,
        notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
        createdAt: sessionDate,
      } as any)
    );
  }
  return items;
}

async function createPayments(attendances: any[], managerUsers: any[], count = COUNTS.payments) {
  const items: any[] = [];
  const approved = attendances.filter((a: any) => a.status === ATTENDANCE_STATUS.COORDINATOR_APPROVED || a.status === ATTENDANCE_STATUS.PARENT_APPROVED);
  const selected = faker.helpers.arrayElements(approved.length ? approved : attendances, Math.min(count, approved.length || attendances.length));
  for (let i = 0; i < selected.length; i++) {
    const a = selected[i];
    const status = faker.helpers.arrayElement([PAYMENT_STATUS.PAID, PAYMENT_STATUS.PENDING, PAYMENT_STATUS.OVERDUE]) as any;
    const paymentDate = status === PAYMENT_STATUS.PAID ? randPastDays(7) : undefined;
    items.push(
      await Payment.create({
        finalClass: a.finalClass,
        attendance: a._id,
        tutor: a.tutor,
        amount: faker.number.int({ min: 300, max: 1000 }),
        currency: 'INR',
        status,
        paymentMethod: faker.helpers.maybe(() => PAYMENT_METHOD.UPI as any, { probability: 0.6 }),
        transactionId: paymentDate ? `TXN${Date.now()}${i}` : undefined,
        paymentDate,
        dueDate: randPastDays(7),
        createdBy: faker.helpers.arrayElement(managerUsers)._id,
        notes: faker.helpers.maybe(() => 'Auto-generated', { probability: 0.4 }),
      } as any)
    );
  }
  return items;
}

async function createDemos(leads: any[], coordinators: any[], tutorUsers: any[], count = COUNTS.demos) {
  const items: any[] = [];
  for (let i = 0; i < count; i++) {
    const lead = faker.helpers.arrayElement(leads);
    const tutor = faker.helpers.arrayElement(tutorUsers);
    const assignedBy = faker.helpers.arrayElement(coordinators);
    items.push(
      await DemoHistory.create({
        classLead: lead._id,
        tutor: tutor._id,
        demoDate: randPastDays(7),
        demoTime: '19:30',
        status: faker.helpers.arrayElement(Object.values(DEMO_STATUS) as string[]) as any,
        assignedBy: assignedBy.user,
        assignedAt: randPastDays(7),
        notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
      } as any)
    );
  }
  return items;
}

async function createTests(finals: any[], coordinators: any[], tutorUsers: any[], count = COUNTS.tests) {
  const items: any[] = [];
  for (let i = 0; i < count; i++) {
    const fc = faker.helpers.arrayElement(finals);
    const tutor = tutorUsers.find((t: any) => String(t._id) === String(fc.tutor)) || faker.helpers.arrayElement(tutorUsers);
    const coord = faker.helpers.arrayElement(coordinators);
    items.push(
      await Test.create({
        finalClass: fc._id,
        tutor: tutor._id,
        coordinator: coord.user,
        testDate: randPastDays(7),
        testTime: '17:00',
        status: faker.helpers.arrayElement(Object.values(TEST_STATUS) as string[]) as any,
        scheduledBy: coord.user,
        scheduledAt: randPastDays(7),
        notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
      } as any)
    );
  }
  return items;
}

async function createFeedback(finals: any[], parents: any[], tutorUsers: any[], count = COUNTS.feedbacks) {
  const items: any[] = [];
  const unique = new Set<string>();
  for (let i = 0; i < count; i++) {
    const fc = faker.helpers.arrayElement(finals);
    const parent = faker.helpers.arrayElement(parents);
    const tutor = tutorUsers.find((t: any) => String(t._id) === String(fc.tutor)) || faker.helpers.arrayElement(tutorUsers);
    // Spread months over last 12 months to avoid unique collisions (tutor, finalClass, month, submittedBy)
    const month = new Date();
    month.setMonth(month.getMonth() - (i % 12));
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const key = `${String(tutor._id)}|${String(fc._id)}|${monthStr}|${String(parent._id)}`;
    if (unique.has(key)) { i--; continue; }
    unique.add(key);
    items.push(
      await TutorFeedback.create({
        tutor: tutor._id,
        finalClass: fc._id,
        submittedBy: parent._id,
        submitterRole: 'PARENT',
        month: monthStr,
        overallRating: faker.number.int({ min: 3, max: 5 }),
        teachingQuality: faker.number.int({ min: 3, max: 5 }),
        punctuality: faker.number.int({ min: 3, max: 5 }),
        communication: faker.number.int({ min: 3, max: 5 }),
        subjectKnowledge: faker.number.int({ min: 3, max: 5 }),
        comments: faker.lorem.sentence(),
        strengths: faker.lorem.words(3),
        improvements: faker.lorem.words(3),
        wouldRecommend: true,
      } as any)
    );
  }
  return items;
}

async function createNotifications(admin: any, tutors: any[], coordinators: any[], count = COUNTS.notifications) {
  const items: any[] = [];
  for (let i = 0; i < count; i++) {
    const recipient = faker.helpers.arrayElement([...tutors, ...coordinators])._id || faker.helpers.arrayElement(coordinators).user;
    items.push(
      await Notification.create({
        recipient,
        type: faker.helpers.arrayElement(['ANNOUNCEMENT', 'DEMO_ASSIGNED', 'PAYMENT', 'VERIFICATION', 'GENERAL', 'ATTENDANCE']) as any,
        title: faker.lorem.words(3),
        message: faker.lorem.sentence(),
        relatedAnnouncement: undefined,
        relatedClassLead: undefined,
        isRead: faker.datatype.boolean(),
        readAt: faker.helpers.maybe(() => randPastDays(7), { probability: 0.3 }),
        createdAt: randPastDays(7),
      } as any)
    );
  }
  return items;
}

async function createCoordinatorAnnouncements(coordinators: any[], finals: any[], tutors: any[], count = COUNTS.coordinatorAnnouncements) {
  const items: any[] = [];
  for (let i = 0; i < count; i++) {
    const coord = faker.helpers.arrayElement(coordinators);
    const recipientType = faker.helpers.arrayElement(['SPECIFIC_CLASS', 'ALL_CLASSES', 'SPECIFIC_TUTOR', 'ALL_TUTORS', 'STUDENTS_PARENTS'] as any);
    items.push(
      await CoordinatorAnnouncement.create({
        coordinator: coord.user,
        subject: faker.lorem.words(5),
        message: faker.lorem.sentences(2),
        recipientType,
        targetClass: recipientType === 'SPECIFIC_CLASS' ? faker.helpers.arrayElement(finals)._id : undefined,
        targetTutor: recipientType === 'SPECIFIC_TUTOR' ? faker.helpers.arrayElement(tutors)._id : undefined,
        recipients: [],
        recipientCount: faker.number.int({ min: 10, max: 100 }),
        sentAt: randPastDays(7),
        createdAt: randPastDays(7),
      } as any)
    );
  }
  return items;
}

async function main() {
  await connect();
  // USERS
  const { admins, managers, coordinators, tutors, parents } = await ensureUsers();
  const admin = admins[0];

  // PROFILES
  const { managerDocs, coordinatorDocs, tutorDocs } = await ensureProfiles({ managers, coordinators, tutors });

  // LEADS & ANNOUNCEMENTS
  const leads = await createLeads(managerDocs, COUNTS.leads);
  const anns = await createAnnouncements(leads, coordinatorDocs, tutors, COUNTS.announcements);

  // FINAL CLASSES
  const finals = await createFinalClasses(leads, tutors, coordinatorDocs, managers, COUNTS.finals);

  // Adjust Coordinator activeClassesCount based on finals
  for (const c of coordinatorDocs) {
    const activeCount = await FinalClass.countDocuments({ coordinator: c.user, status: FINAL_CLASS_STATUS.ACTIVE as any });
    c.activeClassesCount = activeCount;
    c.totalClassesHandled = await FinalClass.countDocuments({ coordinator: c.user });
    await c.save();
  }

  // ATTENDANCE & PAYMENTS
  const atts = await createAttendance(finals, coordinatorDocs, tutors, COUNTS.attendance);
  const pays = await createPayments(atts, managers, COUNTS.payments);

  // DEMOS, TESTS, FEEDBACK, NOTIFICATIONS
  const demos = await createDemos(leads, coordinatorDocs, tutors, COUNTS.demos);
  const tests = await createTests(finals, coordinatorDocs, tutors, COUNTS.tests);
  const feedbacks = await createFeedback(finals, parents, tutors, COUNTS.feedbacks);
  const notifs = await createNotifications(admin, tutors, coordinators, COUNTS.notifications);
  const cAnns = await createCoordinatorAnnouncements(coordinatorDocs, finals, tutors, COUNTS.coordinatorAnnouncements);

  console.log('Mass seed complete:', {
    users: { admins: admins.length, managers: managers.length, coordinators: coordinators.length, tutors: tutors.length, parents: parents.length },
    profiles: { managers: managerDocs.length, coordinators: coordinatorDocs.length, tutors: tutorDocs.length },
    leads: leads.length,
    announcements: anns.length,
    finals: finals.length,
    attendance: atts.length,
    payments: pays.length,
    demos: demos.length,
    tests: tests.length,
    feedbacks: feedbacks.length,
    notifications: notifs.length,
    coordinatorAnnouncements: cAnns.length,
  });
}

main().then(() => mongoose.disconnect()).catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
