/**
 * Seed script: creates realistic ClassLead + Announcement documents.
 * Run: npx ts-node src/seeds/seedClassOpportunities.ts
 *
 * Requires MONGODB_URI in .env (loaded via dotenv).
 * Uses the admin user (ADMIN_SEED_EMAIL) as createdBy / postedBy.
 * Subject refs are resolved from real Option documents in the DB.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import User from '../models/User';
import Option from '../models/Option';
import ClassLead from '../models/ClassLead';
import Announcement from '../models/Announcement';
import { CLASS_LEAD_STATUS, TEACHING_MODE, BOARD_TYPE } from '../config/constants';
import { createAnnouncement } from '../services/announcementService';

const MONGO_URI = process.env.MONGODB_URI as string;
const ADMIN_EMAIL = 'admin@yourshikshak.in';

// ─── Lead templates ──────────────────────────────────────────────────────────
// subject values must match Option.value in the DB (type=SUBJECT)
const LEAD_TEMPLATES = [
  {
    studentName: 'Riya Kapoor',
    studentGender: 'F' as const,
    parentName: 'Sunita Kapoor',
    parentPhone: '9876501001',
    grade: 'Class 9',
    subjectValues: ['mathematics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '7:00 PM - 8:00 PM',
    weekdays: ['Monday', 'Wednesday', 'Friday'],
    classDurationHours: 1,
    classesPerMonth: 12,
    paymentAmount: 2500,
    tutorFees: 2000,
    preferredTutorGender: 'FEMALE',
  },
  {
    studentName: 'Dev Malhotra',
    studentGender: 'M' as const,
    parentName: 'Rajesh Malhotra',
    parentPhone: '9876501002',
    grade: 'Class 11',
    subjectValues: ['physics', 'mathematics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '5:00 PM - 6:30 PM',
    weekdays: ['Tuesday', 'Thursday', 'Saturday'],
    classDurationHours: 1.5,
    classesPerMonth: 12,
    paymentAmount: 4000,
    tutorFees: 3200,
    preferredTutorGender: 'MALE',
  },
  {
    studentName: 'Ananya Singh',
    studentGender: 'F' as const,
    parentName: 'Vikram Singh',
    parentPhone: '9876501003',
    grade: 'Class 10',
    subjectValues: ['mathematics', 'science'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.HYBRID,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '6:00 PM - 7:30 PM',
    weekdays: ['Monday', 'Wednesday', 'Friday'],
    classDurationHours: 1.5,
    classesPerMonth: 12,
    paymentAmount: 5000,
    tutorFees: 4000,
    preferredTutorGender: 'ANY',
  },
  {
    studentName: 'Arjun Sharma',
    studentGender: 'M' as const,
    parentName: 'Priya Sharma',
    parentPhone: '9876501004',
    grade: 'Class 8',
    subjectValues: ['english'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '4:00 PM - 5:00 PM',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    classDurationHours: 1,
    classesPerMonth: 16,
    paymentAmount: 3000,
    tutorFees: 2400,
    preferredTutorGender: 'MALE',
  },
  {
    studentName: 'Priya Nair',
    studentGender: 'F' as const,
    parentName: 'Suresh Nair',
    parentPhone: '9876501005',
    grade: 'Class 12',
    subjectValues: ['chemistry', 'biology'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '8:00 PM - 9:30 PM',
    weekdays: ['Tuesday', 'Friday', 'Sunday'],
    classDurationHours: 1.5,
    classesPerMonth: 12,
    paymentAmount: 4500,
    tutorFees: 3600,
    preferredTutorGender: 'FEMALE',
  },
  {
    studentName: 'Kabir Verma',
    studentGender: 'M' as const,
    parentName: 'Meena Verma',
    parentPhone: '9876501006',
    grade: 'Class 6',
    subjectValues: ['mathematics', 'english'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '3:30 PM - 4:30 PM',
    weekdays: ['Monday', 'Wednesday', 'Friday'],
    classDurationHours: 1,
    classesPerMonth: 12,
    paymentAmount: 2000,
    tutorFees: 1600,
    preferredTutorGender: 'ANY',
  },
  {
    studentName: 'Sneha Gupta',
    studentGender: 'F' as const,
    parentName: 'Anil Gupta',
    parentPhone: '9876501007',
    grade: 'Class 11',
    subjectValues: ['mathematics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '7:30 PM - 9:00 PM',
    weekdays: ['Monday', 'Thursday', 'Saturday'],
    classDurationHours: 1.5,
    classesPerMonth: 12,
    paymentAmount: 3500,
    tutorFees: 2800,
    preferredTutorGender: 'FEMALE',
  },
  {
    studentName: 'Rohan Mehta',
    studentGender: 'M' as const,
    parentName: 'Kavita Mehta',
    parentPhone: '9876501008',
    grade: 'Class 9',
    subjectValues: ['science'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '5:30 PM - 6:30 PM',
    weekdays: ['Tuesday', 'Thursday', 'Saturday'],
    classDurationHours: 1,
    classesPerMonth: 12,
    paymentAmount: 3000,
    tutorFees: 2400,
    preferredTutorGender: 'MALE',
  },
  {
    studentName: 'Ishaan Bose',
    studentGender: 'M' as const,
    parentName: 'Tanmoy Bose',
    parentPhone: '9876501009',
    grade: 'Class 7',
    subjectValues: ['mathematics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '4:00 PM - 5:00 PM',
    weekdays: ['Monday', 'Wednesday', 'Friday'],
    classDurationHours: 1,
    classesPerMonth: 12,
    paymentAmount: 2200,
    tutorFees: 1800,
    preferredTutorGender: 'ANY',
  },
  {
    studentName: 'Aisha Khan',
    studentGender: 'F' as const,
    parentName: 'Irfan Khan',
    parentPhone: '9876501010',
    grade: 'Class 12',
    subjectValues: ['mathematics', 'physics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    city: 'Bhopal',
    area: 'Arera-Colony',
    timing: '9:00 PM - 10:00 PM',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    classDurationHours: 1,
    classesPerMonth: 20,
    paymentAmount: 5500,
    tutorFees: 4400,
    preferredTutorGender: 'MALE',
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ── Delete previously seeded data ───────────────────────────────────────────
  const seededNames = LEAD_TEMPLATES.map((t) => t.studentName);
  const existingLeads = await ClassLead.find({ studentName: { $in: seededNames } }).lean();
  if (existingLeads.length > 0) {
    const leadIds = existingLeads.map((l) => l._id);
    const { deletedCount: annDel } = await Announcement.deleteMany({ classLead: { $in: leadIds } });
    const { deletedCount: leadDel } = await ClassLead.deleteMany({ _id: { $in: leadIds } });
    console.log(`Deleted ${leadDel} leads and ${annDel} announcements from previous seed`);
  }

  // Find admin user
  const adminUser = await User.findOne({ email: ADMIN_EMAIL }).lean();
  if (!adminUser) {
    console.error(`Admin user not found for email: ${ADMIN_EMAIL}`);
    process.exit(1);
  }
  const adminId = adminUser._id as mongoose.Types.ObjectId;
  console.log(`Using admin: ${adminUser.name} (${adminId})`);

  // Load all active SUBJECT options into a value→_id map
  const subjectOptions = await Option.find({ type: 'SUBJECT', isActive: true }).lean();
  const subjectMap = new Map<string, mongoose.Types.ObjectId>();
  for (const opt of subjectOptions) {
    subjectMap.set(opt.value.toLowerCase(), opt._id as mongoose.Types.ObjectId);
    subjectMap.set(opt.label.toLowerCase(), opt._id as mongoose.Types.ObjectId);
  }
  console.log(`Loaded ${subjectOptions.length} subject options`);

  let created = 0;
  let skipped = 0;

  for (const tpl of LEAD_TEMPLATES) {
    // Resolve subject ObjectIds (fall back to first available subject if not found)
    const subjectIds: mongoose.Types.ObjectId[] = [];
    for (const sv of tpl.subjectValues) {
      const found = subjectMap.get(sv.toLowerCase());
      if (found) {
        subjectIds.push(found);
      } else {
        // Use any available subject as fallback
        if (subjectOptions.length > 0) {
          subjectIds.push(subjectOptions[0]._id as mongoose.Types.ObjectId);
          console.warn(`  Subject "${sv}" not found — using fallback: ${subjectOptions[0].label}`);
        }
      }
    }
    if (subjectIds.length === 0) {
      console.warn(`  Skipping "${tpl.studentName}" — no subjects could be resolved`);
      skipped++;
      continue;
    }

    // Skip if an announcement for a lead with this studentName+grade already exists
    const existingLead = await ClassLead.findOne({
      studentName: tpl.studentName,
      grade: tpl.grade,
    }).lean();
    if (existingLead) {
      console.log(`  Skipping "${tpl.studentName}" (${tpl.grade}) — already exists`);
      skipped++;
      continue;
    }

    // Auto-generate leadId
    const leadId = `LD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const lead = await ClassLead.create({
      leadId,
      studentType: 'SINGLE',
      studentName: tpl.studentName,
      studentGender: tpl.studentGender,
      parentName: tpl.parentName,
      parentPhone: tpl.parentPhone,
      grade: tpl.grade,
      subject: subjectIds,
      board: tpl.board,
      mode: tpl.mode,
      city: tpl.city,
      area: tpl.area,
      timing: tpl.timing,
      weekdays: tpl.weekdays,
      classDurationHours: tpl.classDurationHours,
      classesPerMonth: tpl.classesPerMonth,
      paymentAmount: tpl.paymentAmount,
      tutorFees: tpl.tutorFees,
      preferredTutorGender: tpl.preferredTutorGender,
      status: CLASS_LEAD_STATUS.ANNOUNCED,
      leadSource: 'WEBSITE',
      createdBy: adminId,
    });

    // createAnnouncement sends push notifications to all active tutors
    await createAnnouncement(String(lead._id), String(adminId));

    console.log(`  Created: ${tpl.studentName} (${tpl.grade}) — ${tpl.mode} — ${tpl.city}/${tpl.area}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
