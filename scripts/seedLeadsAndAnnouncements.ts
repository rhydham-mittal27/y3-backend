/**
 * Seed Script — Class Leads + Announcements + Tutor Notifications
 *
 * Looks up admin@yourshikshak.in, creates sample class leads (weekdays only,
 * random timings, classesPerMonth < 20), announces them, and fires FCM push +
 * in-app notifications to every active tutor.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seedLeadsAndAnnouncements.ts
 *
 * Dry run (no DB writes, just prints what would happen):
 *   DRY_RUN=true npx ts-node -r tsconfig-paths/register scripts/seedLeadsAndAnnouncements.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import admin from 'firebase-admin';
import connectDB from '../src/config/database';
import ClassLead from '../src/models/ClassLead';
import Announcement from '../src/models/Announcement';
import User from '../src/models/User';
import Option from '../src/models/Option';
import Notification from '../src/models/Notification';
import { logInfo, logError } from '../src/utils/logger';

const DRY_RUN = process.env.DRY_RUN === 'true';

// ─── Weekday pools ────────────────────────────────────────────────────────────
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

// Pick 3 or 4 random weekdays for each lead
const pickWeekdays = (): string[] => {
  const shuffled = [...WEEKDAYS].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.5 ? 3 : 4;
  return shuffled.slice(0, count).sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
};

// Random time slot between 3 PM and 9 PM
const randomTimeSlot = (): string => {
  const starts = ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM'];
  const durations = [60, 90]; // minutes
  const start = starts[Math.floor(Math.random() * starts.length)];
  const dur = durations[Math.floor(Math.random() * durations.length)];
  const label = dur === 60 ? '1 hr' : '1.5 hrs';
  return `${start} (${label})`;
};

// classesPerMonth: between 8 and 19 (≤ 20, must align with days/week count chosen)
const classesPerMonth = (daysPerWeek: number): number => {
  // sessions per week × ~4 weeks, but cap at 19
  const base = daysPerWeek * 4;
  return Math.min(19, base);
};

// ─── Lead templates ───────────────────────────────────────────────────────────
const LEAD_TEMPLATES = [
  {
    studentName: 'Aarav Sharma',
    grade: '10',
    board: 'CBSE',
    subjectLabels: ['Mathematics', 'Physics'],
    mode: 'OFFLINE',
    city: 'Delhi',
    monthlyFee: 4000,
    notes: 'Student needs extra help with algebra and mechanics.',
  },
  {
    studentName: 'Priya Nair',
    grade: '8',
    board: 'CBSE',
    subjectLabels: ['English', 'Science'],
    mode: 'ONLINE',
    city: 'Mumbai',
    monthlyFee: 2500,
    notes: 'Needs improvement in comprehension and lab concepts.',
  },
  {
    studentName: 'Rahul Verma',
    grade: '12',
    board: 'CBSE',
    subjectLabels: ['Chemistry', 'Biology'],
    mode: 'HYBRID',
    city: 'Bangalore',
    monthlyFee: 6000,
    notes: 'NEET aspirant. Needs rigorous practice sessions.',
  },
  {
    studentName: 'Simran Kaur',
    grade: '6',
    board: 'ICSE',
    subjectLabels: ['Mathematics'],
    mode: 'OFFLINE',
    city: 'Chandigarh',
    monthlyFee: 2000,
    notes: 'Strong in theory, needs help with problem solving.',
  },
  {
    studentName: 'Dev Patel',
    grade: '11',
    board: 'CBSE',
    subjectLabels: ['Physics', 'Chemistry'],
    mode: 'ONLINE',
    city: 'Ahmedabad',
    monthlyFee: 5000,
    notes: 'JEE aspirant targeting top 1000 rank.',
  },
];

// ─── Creative notification variants ──────────────────────────────────────────
const notifCopy = (studentName: string, grade: string, subjects: string, mode: string, city: string, days: string[]) => {
  const dayStr = days.map(d => d[0] + d.slice(1).toLowerCase()).join(', ');
  const variants = [
    {
      title: `📣 New Class — Grade ${grade} ${subjects} (${city})`,
      body: `${studentName} is looking for a ${mode.toLowerCase()} tutor for ${subjects}. Classes on ${dayStr}. Be the first to grab it! 🚀`,
    },
    {
      title: `🎯 Fresh Lead: ${subjects} · Grade ${grade} · ${city}`,
      body: `${studentName} needs a dedicated tutor — ${mode} sessions on ${dayStr} in ${city}. Open now, act fast! ⚡`,
    },
    {
      title: `✨ ${subjects} Tutor Needed in ${city}`,
      body: `Grade ${grade} student (${board(studentName)}) seeking ${subjects} help on ${dayStr}. Express interest before someone else does! 📚`,
    },
    {
      title: `🏆 Opportunity Alert — ${subjects} (${mode})`,
      body: `New student in ${city} waiting for a ${subjects} tutor. Grade ${grade}, ${mode} mode, ${dayStr}. Your next class is one tap away! 💡`,
    },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
};

// board lookup helper (just returns CBSE/ICSE from the template; kept simple)
const board = (_: string) => 'CBSE'; // placeholder, actual board comes from template

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateLeadId = (name: string) => {
  const prefix = name.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${rand}`;
};

const resolveSubjectIds = async (labels: string[]): Promise<mongoose.Types.ObjectId[]> => {
  const ids: mongoose.Types.ObjectId[] = [];
  for (const label of labels) {
    let opt = await Option.findOne({ label: { $regex: new RegExp(`^${label}$`, 'i') }, type: 'SUBJECT' });
    if (!opt) {
      opt = await Option.create({ label, value: label.toLowerCase().replace(/\s+/g, '_'), type: 'SUBJECT' });
      logInfo(`[seed] Created missing subject option: ${label}`);
    }
    ids.push(opt._id as mongoose.Types.ObjectId);
  }
  return ids;
};

const sendFCM = async (token: string, title: string, body: string, classLeadId: string) => {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(require('../firebase-service-account.json')) });
    }
    await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
      data: { type: 'NEW_ANNOUNCEMENT', classLeadId, deepLink: 'yourshikshak://opportunities' },
    });
    return true;
  } catch (e: any) {
    logError(`[seed] FCM failed: ${e.message}`);
    return false;
  }
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
  await connectDB();
  logInfo(`[seed] DB connected. DRY_RUN=${DRY_RUN}`);

  // Resolve admin user
  const adminUser = await User.findOne({ email: 'admin@yourshikshak.in' }).select('_id name');
  if (!adminUser) {
    console.error('❌  admin@yourshikshak.in not found in the database');
    process.exit(1);
  }
  logInfo(`[seed] Admin found: ${adminUser.name} (${adminUser._id})`);

  // All active tutors
  const tutors = await User.find({ role: 'TUTOR', isActive: { $ne: false } }).select('_id name expoPushToken');
  logInfo(`[seed] ${tutors.length} active tutors to notify`);

  const results = { leads: 0, announcements: 0, inApp: 0, push: 0, pushFailed: 0 };

  for (const tmpl of LEAD_TEMPLATES) {
    const days      = pickWeekdays();
    const timeSlot  = randomTimeSlot();
    const sessions  = classesPerMonth(days.length);
    const subjects  = tmpl.subjectLabels.join(', ');

    console.log(`\n📝  ${tmpl.studentName} | ${subjects} | Grade ${tmpl.grade} | ${tmpl.mode}`);
    console.log(`    Days: ${days.join(', ')}  |  Time: ${timeSlot}  |  Sessions/month: ${sessions}`);

    if (DRY_RUN) {
      console.log('    [DRY] Skipping DB write');
      continue;
    }

    const subjectIds = await resolveSubjectIds(tmpl.subjectLabels);

    // Create class lead
    const lead = await ClassLead.create({
      studentName:     tmpl.studentName,
      studentType:     'SINGLE',
      grade:           tmpl.grade,
      board:           tmpl.board,
      subject:         subjectIds,
      mode:            tmpl.mode,
      city:            tmpl.city,
      classesPerMonth: sessions,
      monthlyFee:      tmpl.monthlyFee,
      weekdays:        days,
      preferredTime:   timeSlot,
      notes:           tmpl.notes,
      leadId:          generateLeadId(tmpl.studentName),
      createdBy:       adminUser._id,
      status:          'ANNOUNCED',
    });
    results.leads++;
    logInfo(`[seed] Lead: ${lead.leadId} — ${lead.studentName} (${sessions} sessions, ${days.join('/')})`);

    // Create announcement
    const announcement = await Announcement.create({
      classLead: lead._id,
      postedBy:  adminUser._id,
      postedAt:  new Date(),
      isActive:  true,
    });
    results.announcements++;

    // Notify tutors
    const notif = notifCopy(tmpl.studentName, tmpl.grade, subjects, tmpl.mode, tmpl.city || '', days);

    for (const tutor of tutors) {
      try {
        await Notification.create({
          recipient:         tutor._id,
          type:              'ANNOUNCEMENT',
          title:             notif.title,
          message:           notif.body,
          relatedAnnouncement: announcement._id,
          relatedClassLead:  lead._id,
        });
        results.inApp++;
      } catch (e: any) {
        logError(`[seed] In-app notif failed for ${tutor._id}: ${e.message}`);
      }

      const token: string | undefined = (tutor as any).expoPushToken;
      if (token && token.length > 10) {
        const ok = await sendFCM(token, notif.title, notif.body, String(lead._id));
        if (ok) results.push++; else results.pushFailed++;
      }
    }

    logInfo(`[seed] Notified ${tutors.length} tutors`);
  }

  console.log('\n✅  Done!');
  console.log(`   Leads created        : ${results.leads}`);
  console.log(`   Announcements        : ${results.announcements}`);
  console.log(`   In-app notifications : ${results.inApp}`);
  console.log(`   FCM pushes sent      : ${results.push}`);
  console.log(`   FCM pushes failed    : ${results.pushFailed}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  logError(`[seed] Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
