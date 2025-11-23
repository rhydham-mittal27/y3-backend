import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import ClassLead from '../models/ClassLead';
import Coordinator from '../models/Coordinator';
import Announcement from '../models/Announcement';
import { CLASS_LEAD_STATUS } from '../config/constants';
import { createAnnouncement } from '../services/announcementService';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

const MAX_ANNOUNCEMENTS = 50; // cap to avoid creating too many at once

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function seedAnnouncementsForLeads() {
  // Load coordinators (we'll post announcements as coordinators)
  const coordinators = await Coordinator.find({}).lean();
  if (!coordinators.length) {
    console.log('No coordinators found. Run the staff seed first.');
    return;
  }

  // Find leads that are NEW or ANNOUNCED and don't already have an announcement
  const existingAnns = await Announcement.find({}).select('classLead').lean();
  const announcedIds = new Set(existingAnns.map((a: any) => String(a.classLead)));

  const eligibleLeads = await ClassLead.find({
    status: { $in: [CLASS_LEAD_STATUS.NEW, CLASS_LEAD_STATUS.ANNOUNCED] },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_ANNOUNCEMENTS * 2) // fetch a bit more to account for already-announced ones
    .lean();

  const targets = eligibleLeads.filter((l: any) => !announcedIds.has(String(l._id))).slice(0, MAX_ANNOUNCEMENTS);

  if (!targets.length) {
    console.log('No eligible class leads found for announcements.');
    return;
  }

  let createdCount = 0;

  for (const lead of targets) {
    const coord = faker.helpers.arrayElement(coordinators as any[]);
    const postedByUserId = String((coord as any).user);

    try {
      await createAnnouncement(String(lead._id), postedByUserId);
      createdCount += 1;
    } catch (e: any) {
      // Ignore conflicts if an announcement already exists, log other errors
      if (e?.statusCode === 409 || e?.status === 409) {
        continue;
      }
      console.error('Failed to create announcement for lead', String(lead._id), '-', e?.message || e);
    }
  }

  console.log(`Created ${createdCount} new announcements for class leads.`);
}

async function main() {
  await connect();
  await seedAnnouncementsForLeads();
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Class lead announcement seed failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
