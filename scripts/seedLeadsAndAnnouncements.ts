/**
 * Seed Script — Class Leads + Announcements + Tutor Notifications
 *
 * Creates sample class leads, announces them, and fires FCM push + in-app
 * notifications to every active tutor so they can express interest.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seedLeadsAndAnnouncements.ts
 *
 * Options (env vars):
 *   CREATED_BY_USER_ID   — manager/admin user ID to attribute leads to (required)
 *   DRY_RUN=true         — print what would be created without writing to DB
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
const CREATED_BY = process.env.CREATED_BY_USER_ID;

// ─── Lead templates ───────────────────────────────────────────────────────────
// subjects are resolved from Option collection at runtime by label
const LEAD_TEMPLATES = [
  {
    studentName: 'Aarav Sharma',
    grade: '10',
    board: 'CBSE',
    subjectLabels: ['Mathematics', 'Physics'],
    mode: 'OFFLINE',
    city: 'Delhi',
    classesPerMonth: 12,
    monthlyFee: 4000,
    preferredTime: '5:00 PM - 7:00 PM',
    notes: 'Student needs extra help with algebra and mechanics.',
  },
  {
    studentName: 'Priya Nair',
    grade: '8',
    board: 'CBSE',
    subjectLabels: ['English', 'Science'],
    mode: 'ONLINE',
    city: 'Mumbai',
    classesPerMonth: 8,
    monthlyFee: 2500,
    preferredTime: '4:00 PM - 5:30 PM',
    notes: 'Needs improvement in comprehension and lab concepts.',
  },
  {
    studentName: 'Rahul Verma',
    grade: '12',
    board: 'CBSE',
    subjectLabels: ['Chemistry', 'Biology'],
    mode: 'HYBRID',
    city: 'Bangalore',
    classesPerMonth: 16,
    monthlyFee: 6000,
    preferredTime: '6:00 PM - 8:00 PM',
    notes: 'NEET aspirant. Needs rigorous practice sessions.',
  },
  {
    studentName: 'Simran Kaur',
    grade: '6',
    board: 'ICSE',
    subjectLabels: ['Mathematics'],
    mode: 'OFFLINE',
    city: 'Chandigarh',
    classesPerMonth: 10,
    monthlyFee: 2000,
    preferredTime: '3:00 PM - 4:30 PM',
    notes: 'Strong in theory, needs help with problem solving.',
  },
  {
    studentName: 'Dev Patel',
    grade: '11',
    board: 'CBSE',
    subjectLabels: ['Physics', 'Chemistry'],
    mode: 'ONLINE',
    city: 'Ahmedabad',
    classesPerMonth: 14,
    monthlyFee: 5000,
    preferredTime: '7:00 PM - 9:00 PM',
    notes: 'JEE aspirant targeting top 1000 rank.',
  },
];

// ─── Creative announcement notification messages ───────────────────────────────
const announcementMessages = (studentName: string, grade: string, subjects: string, mode: string, city: string) => {
  const variants = [
    {
      title: `📣 New Class Opportunity — Grade ${grade} ${subjects}!`,
      body: `A student in ${city} is looking for a ${mode.toLowerCase()} tutor for ${subjects} (Grade ${grade}). Be the first to express interest and secure this class! 🚀`,
    },
    {
      title: `🎯 Fresh Lead: ${subjects} · Grade ${grade} · ${city}`,
      body: `${studentName} needs a dedicated tutor for ${subjects}. ${mode} sessions in ${city}. Open now — grab it before someone else does! ⚡`,
    },
    {
      title: `✨ New Student Waiting — ${subjects} (${city})`,
      body: `Grade ${grade} student in ${city} is actively seeking a ${subjects} tutor. ${mode} mode. Express interest now and start teaching! 📚`,
    },
  ];
  return variants[Math.floor(Math.random() * variants.length)];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateLeadId = (name: string) => {
  const prefix = name.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${rand}`;
};

const resolveSubjectIds = async (labels: string[]): Promise<mongoose.Types.ObjectId[]> => {
  const ids: mongoose.Types.ObjectId[] = [];
  for (const label of labels) {
    const opt = await Option.findOne({ label: { $regex: new RegExp(`^${label}$`, 'i') }, type: 'SUBJECT' });
    if (opt) {
      ids.push(opt._id as mongoose.Types.ObjectId);
    } else {
      // Create option if missing so the script is self-contained
      const created = await Option.create({ label, value: label.toLowerCase().replace(/\s+/g, '_'), type: 'SUBJECT' });
      ids.push(created._id as mongoose.Types.ObjectId);
      logInfo(`[seed] Created missing subject option: ${label}`);
    }
  }
  return ids;
};

const sendFCMPush = async (token: string, title: string, body: string, classLeadId: string) => {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(require('../firebase-service-account.json')),
      });
    }
    await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
      data: { type: 'NEW_ANNOUNCEMENT', classLeadId, deepLink: 'yourshikshak://opportunities' },
    });
    return true;
  } catch (e: any) {
    logError(`[seed] FCM send failed: ${e.message}`);
    return false;
  }
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
  if (!CREATED_BY) {
    console.error('❌  Set CREATED_BY_USER_ID env var to a valid manager/admin user ID');
    process.exit(1);
  }

  await connectDB();
  logInfo(`[seed] Connected. DRY_RUN=${DRY_RUN}`);

  // Fetch all active tutors with FCM tokens
  const tutors = await User.find({ role: 'TUTOR', isActive: { $ne: false } }).select('_id name expoPushToken');
  logInfo(`[seed] Found ${tutors.length} active tutors to notify`);

  const results = { leads: 0, announcements: 0, inApp: 0, push: 0, pushFailed: 0 };

  for (const template of LEAD_TEMPLATES) {
    console.log(`\n📝  Processing: ${template.studentName} — ${template.subjectLabels.join(', ')}`);

    // Resolve subject ObjectIds
    const subjectIds = DRY_RUN ? [] : await resolveSubjectIds(template.subjectLabels);
    const subjectLabel = template.subjectLabels.join(', ');

    if (DRY_RUN) {
      console.log(`   [DRY] Would create lead + announcement for ${template.studentName}`);
      continue;
    }

    // Create class lead
    const lead = await ClassLead.create({
      studentName: template.studentName,
      studentType: 'SINGLE',
      grade: template.grade,
      board: template.board,
      subject: subjectIds,
      mode: template.mode,
      city: template.city,
      classesPerMonth: template.classesPerMonth,
      monthlyFee: template.monthlyFee,
      preferredTime: template.preferredTime,
      notes: template.notes,
      leadId: generateLeadId(template.studentName),
      createdBy: new mongoose.Types.ObjectId(CREATED_BY),
      status: 'ANNOUNCED',
    });
    results.leads++;
    logInfo(`[seed] Lead created: ${lead.leadId} — ${lead.studentName}`);

    // Create announcement
    const announcement = await Announcement.create({
      classLead: lead._id,
      postedBy: new mongoose.Types.ObjectId(CREATED_BY),
      postedAt: new Date(),
      isActive: true,
    });
    results.announcements++;
    logInfo(`[seed] Announcement created: ${announcement._id}`);

    // Notify all tutors
    const notif = announcementMessages(template.studentName, template.grade, subjectLabel, template.mode, template.city || '');

    for (const tutor of tutors) {
      try {
        // In-app notification
        await Notification.create({
          recipient: tutor._id,
          type: 'ANNOUNCEMENT',
          title: notif.title,
          message: notif.body,
          relatedAnnouncement: announcement._id,
          relatedClassLead: lead._id,
        });
        results.inApp++;
      } catch (e: any) {
        logError(`[seed] In-app notification failed for tutor ${tutor._id}: ${e.message}`);
      }

      // FCM push
      const token: string | undefined = (tutor as any).expoPushToken;
      if (token && token.length > 10) {
        const ok = await sendFCMPush(token, notif.title, notif.body, String(lead._id));
        if (ok) results.push++; else results.pushFailed++;
      }
    }

    logInfo(`[seed] Notified ${tutors.length} tutors for ${template.studentName}`);
  }

  console.log('\n✅  Seed complete!');
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
