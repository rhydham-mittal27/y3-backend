import 'dotenv/config';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from '../models/User';
import Tutor from '../models/Tutor';
import Manager from '../models/Manager';
import Coordinator from '../models/Coordinator';
import { USER_ROLES, TEACHING_MODE, VERIFICATION_STATUS, TUTOR_TIER } from '../config/constants';
import { config } from 'dotenv';
config()
const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb+srv://harrypaaji32:Welcome%402025@cluster0.ikrg43p.mongodb.net/test-ys';

const COUNTS = {
  managers: 5,
  coordinators: 5,
  tutors: 15,
};

const randPastDays = (maxDays = 30) => {
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

async function createUser(role: USER_ROLES, index: number): Promise<any> {
  let prefix = 'user';
  if (role === USER_ROLES.MANAGER) prefix = 'manager';
  else if (role === USER_ROLES.COORDINATOR) prefix = 'coordinator';
  else if (role === USER_ROLES.TUTOR) prefix = 'tutor';

  const email = `${prefix}${index + 1}@test.com`;
  const name = `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${index + 1}`;

  const user = await User.create({
    name,
    email,
    password: 'Password@123',
    role,
    phone: '+91' + faker.string.numeric(10),
    isActive: true,
    createdAt: randPastDays(30),
    updatedAt: new Date(),
  } as any);
  return user;
}

async function seedManagers(count: number) {
  const users: any[] = [];
  const profiles: any[] = [];
  for (let i = 0; i < count; i++) {
    const user = await createUser(USER_ROLES.MANAGER, i);
    users.push(user);
    profiles.push(
      await Manager.create({
        user: user._id,
        classLeadsCreated: 0,
        demosScheduled: 0,
        classesConverted: 0,
        revenueGenerated: 0,
        tutorsVerified: 0,
        coordinatorsCreated: 0,
        paymentsProcessed: 0,
        isActive: true,
        joiningDate: randPastDays(200),
      })
    );
  }
  return { users, profiles };
}

async function seedCoordinators(count: number) {
  const users: any[] = [];
  const profiles: any[] = [];
  for (let i = 0; i < count; i++) {
    const user = await createUser(USER_ROLES.COORDINATOR, i);
    users.push(user);
    profiles.push(
      await Coordinator.create({
        user: user._id,
        assignedClasses: [],
        maxClassCapacity: faker.number.int({ min: 5, max: 20 }),
        activeClassesCount: 0,
        totalClassesHandled: 0,
        specialization: [faker.helpers.arrayElement(['Math', 'Science', 'English', 'Physics'])],
        joiningDate: randPastDays(200),
        performanceScore: faker.number.int({ min: 60, max: 95 }),
        isActive: true,
      })
    );
  }
  return { users, profiles };
}

async function seedTutors(count: number) {
  const users: any[] = [];
  const profiles: any[] = [];
  for (let i = 0; i < count; i++) {
    const user = await createUser(USER_ROLES.TUTOR, i);
    users.push(user);
    profiles.push(
      await Tutor.create({
        user: user._id,
        experienceHours: faker.number.int({ min: 20, max: 500 }),
        subjects: faker.helpers.arrayElements(['Math', 'Science', 'English', 'Physics', 'Chemistry'], 2),
        qualifications: faker.helpers.arrayElements(['B.Ed', 'M.Sc', 'B.Sc', 'M.A'], 1),
        ratings: faker.number.float({ min: 3, max: 5, fractionDigits: 1 }),
        totalRatings: faker.number.int({ min: 0, max: 50 }),
        classesAssigned: 0,
        classesCompleted: 0,
        demosTaken: faker.number.int({ min: 0, max: 10 }),
        demosApproved: faker.number.int({ min: 0, max: 10 }),
        interestCount: 0,
        verificationStatus: VERIFICATION_STATUS.PENDING,
        documents: [],
        isAvailable: true,
        preferredMode: TEACHING_MODE.ONLINE,
        preferredLocations: [faker.location.city()],
        tier: TUTOR_TIER.BRONZE,
      } as any)
    );
  }
  return { users, profiles };
}

async function main() {
  await connect();

  const managers = await seedManagers(COUNTS.managers);
  const coordinators = await seedCoordinators(COUNTS.coordinators);
  const tutors = await seedTutors(COUNTS.tutors);

  console.log('Staff seed complete:', {
    managers: { users: managers.users.length, profiles: managers.profiles.length },
    coordinators: { users: coordinators.users.length, profiles: coordinators.profiles.length },
    tutors: { users: tutors.users.length, profiles: tutors.profiles.length },
  });

  console.log('Login credentials (password is always Password@123):');
  console.log('Managers:', managers.users.map((u: any, i: number) => `${i + 1}. ${u.email}`).join(' | '));
  console.log('Coordinators:', coordinators.users.map((u: any, i: number) => `${i + 1}. ${u.email}`).join(' | '));
  console.log('Tutors:', tutors.users.map((u: any, i: number) => `${i + 1}. ${u.email}`).join(' | '));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Staff seed failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
