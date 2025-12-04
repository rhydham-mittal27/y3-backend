import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import ClassLead from '../models/ClassLead';
import Manager from '../models/Manager';
import { BOARD_TYPE, TEACHING_MODE } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

const LEADS_PER_MANAGER = 5; // adjust if you want more/less per manager

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

async function seedClassLeadsPerManager() {
  const managers = await Manager.find({}).lean();
  if (!managers.length) {
    console.log('No managers found. Run the staff seed first.');
    return;
  }

  const results: { managerId: string; count: number }[] = [];

  for (const mgr of managers as any[]) {
    const created: any[] = [];
    const managerUserId = String(mgr.user);

    for (let i = 0; i < LEADS_PER_MANAGER; i++) {
      const doc = await ClassLead.create({
        studentName: faker.person.firstName() + ' ' + faker.person.lastName(),
        grade: faker.helpers.arrayElement(['7', '8', '9', '10', '11', '12']),
        subject: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
        board: faker.helpers.arrayElement(Object.values(BOARD_TYPE) as string[]),
        mode: faker.helpers.arrayElement(Object.values(TEACHING_MODE) as string[]),
        location: faker.location.city(),
        timing: faker.helpers.arrayElement(['Mon-Wed-Fri 6PM', 'Tue-Thu 7PM', 'Weekend 5PM']),
        status: "NEW",
        createdBy: managerUserId,
        notes: faker.lorem.sentence(),
        createdAt: randPastDays(14),
      } as any);
      created.push(doc);
    }

    results.push({ managerId: managerUserId, count: created.length });
  }

  console.log('Class lead seeding complete. Created leads per manager:');
  for (const r of results) {
    console.log(`- manager userId ${r.managerId}: ${r.count} leads`);
  }
}

async function main() {
  await connect();
  await seedClassLeadsPerManager();
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Class lead seed failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
