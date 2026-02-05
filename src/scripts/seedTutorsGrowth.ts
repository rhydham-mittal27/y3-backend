import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import { USER_ROLES, BOARD_TYPE, TEACHING_MODE, CLASS_LEAD_STATUS, VERIFICATION_STATUS, FINAL_CLASS_STATUS } from '../config/constants';

// Helper to get random date within last N days
const getRandomDate = (daysBack: number) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date;
};

// Helper keys for seeded entities
const MANAGER_EMAIL = 'seed.manager.growth@example.com';
const COORDINATOR_EMAIL = 'seed.coordinator.growth@example.com';

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function upsertUser(name: string, email: string, role: string, createdAt: Date) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      password: 'Password@123',
      role,
      createdAt, // Force creation date
      isActive: true
    });
  }
  return user;
}

async function seedTutorsGrowth() {
  await connect();

  try {
    // 1. Ensure dependencies exist
    const manager = await upsertUser('Growth Manager', MANAGER_EMAIL, USER_ROLES.MANAGER, new Date());
    const coordinator = await upsertUser('Growth Coordinator', COORDINATOR_EMAIL, USER_ROLES.COORDINATOR, new Date());

    console.log('Dependencies checked (Manager & Coordinator). Starting seed...');

    const TOTAL_TUTORS = 100;
    const DAYS_RANGE = 180; // Spread over last 6 months

    let activeCount = 0;
    let verifiedCount = 0;
    let pendingCount = 0;

    for (let i = 0; i < TOTAL_TUTORS; i++) {
        try {
            const createdAt = getRandomDate(DAYS_RANGE);
            const email = `seed.tutor.growth.${i}@example.com`;
            
            // 2. Upsert User
            let user = await User.findOne({ email });
            if (!user) {
                user = await User.create({
                    name: `Tutor Growth ${i}`,
                    email,
                    password: 'Password@123',
                    role: USER_ROLES.TUTOR,
                    isActive: true,
                    createdAt
                });
            }
            // Update timestamp
            await User.updateOne({ _id: user._id }, { $set: { createdAt: createdAt } });

            // 3. Determine Status & Upsert Tutor
            const rand = Math.random();
            let status = VERIFICATION_STATUS.PENDING;
            let isActiveTutor = false;

            if (rand < 0.4) {
                status = VERIFICATION_STATUS.PENDING;
                pendingCount++;
            } else if (rand < 0.8) {
                status = VERIFICATION_STATUS.VERIFIED;
                verifiedCount++;
                if (Math.random() > 0.5) isActiveTutor = true;
            } else {
                status = VERIFICATION_STATUS.REJECTED;
            }

            let tutor = await Tutor.findOne({ user: user._id });
            if (!tutor) {
                tutor = await Tutor.create({
                    user: user._id,
                    experienceHours: Math.floor(Math.random() * 1000),
                    subjects: ['Math', 'Science'],
                    verificationStatus: status,
                    classesAssigned: isActiveTutor ? 1 : 0,
                    createdAt: createdAt
                } as any);
            }
            await Tutor.updateOne({ _id: tutor._id }, { $set: { createdAt: createdAt, verificationStatus: status } });

            // 5. If Active, create FinalClass (Upsert based on unique className)
            if (isActiveTutor) {
                activeCount++;
                const className = `Math Class ${i}`;
                
                // Active tutors active status check depends on FinalClass existence
                const existingClass = await FinalClass.findOne({ className });
                
                if (!existingClass) {
                   // Create Lead first
                   const lead = await ClassLead.create({
                      studentName: `Student for ${user.name}`,
                      grade: '10',
                      subject: ['Math'],
                      board: BOARD_TYPE.CBSE,
                      mode: TEACHING_MODE.ONLINE,
                      status: CLASS_LEAD_STATUS.CONVERTED,
                      assignedTutor: user._id,
                      createdBy: manager._id,
                      createdAt: createdAt
                   } as any);

                   await FinalClass.create({
                      className,
                      classLead: lead._id,
                      tutor: user._id,
                      coordinator: coordinator._id,
                      status: FINAL_CLASS_STATUS.ACTIVE,
                      startDate: createdAt,
                      studentName: lead.studentName,
                      subject: lead.subject,
                      grade: lead.grade,
                      board: lead.board,
                      mode: lead.mode,
                      convertedBy: manager._id,
                      createdAt: createdAt
                   } as any);
                }
            }
        } catch (innerErr) {
            console.error(`Failed to seed tutor ${i}:`, innerErr);
        }
    }

    console.log(`
      SEEDING COMPLETE:
      ------------------
      Total Tutors: ${TOTAL_TUTORS}
      Verified:     ${verifiedCount} (approx)
      Active (Class): ${activeCount} (approx)
      Pending (DV): ${pendingCount} (approx)
      
      Note: 'Verified' count in DB includes those who are also Active.
      'Active' count is based on having an active FinalClass.
    `);

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seedTutorsGrowth();
