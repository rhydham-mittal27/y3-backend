import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import { VERIFICATION_STATUS } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function seedUnverifiedTutors() {
  await connect();

  const tutorsToSeed = [
    {
      name: 'Unverified Tutor One',
      email: 'unverified1@example.com',
      phone: '9999900001',
      status: VERIFICATION_STATUS.PENDING,
    },
    {
      name: 'Unverified Tutor Two',
      email: 'unverified2@example.com',
      phone: '9999900002',
      status: VERIFICATION_STATUS.PENDING,
    },
    {
      name: 'Rejected Tutor One',
      email: 'rejected1@example.com',
      phone: '9999911001',
      status: VERIFICATION_STATUS.REJECTED,
      rejectionReason: 'The uploaded ID proof is blurry and unreadable. Please provide a clear scan.',
    },
    {
      name: 'Rejected Tutor Two',
      email: 'rejected2@example.com',
      phone: '9999911002',
      status: VERIFICATION_STATUS.REJECTED,
      rejectionReason: 'Qualification certificates are missing. Please upload your degree certificate.',
    },
  ];

  // Using real subject IDs from the database (Mathematics and Science)
  const mathId = '69e347b270c33186a3348902';
  const physicsId = '69e347b270c33186a33488ba';

  for (const data of tutorsToSeed) {
    try {
      // 1. Create/Update User
      let user = await User.findOne({ email: data.email });
      if (!user) {
        user = await User.create({
          name: data.name,
          email: data.email,
          phone: data.phone,
          password: 'Password123!',
          role: 'TUTOR',
          isActive: true,
          gender: 'OTHER',
        });
        console.log(`Created user: ${data.name}`);
      }

      // 2. Create/Update Tutor Profile
      await Tutor.findOneAndUpdate(
        { user: user._id },
        {
          verificationStatus: data.status,
          verificationRejectionReason: (data as any).rejectionReason || undefined,
          subjects: [new mongoose.Types.ObjectId(mathId), new mongoose.Types.ObjectId(physicsId)],
          qualifications: ['Bachelor of Science'],
          yearsOfExperience: 2,
          isAvailable: true,
        },
        { upsert: true, new: true }
      );
      console.log(`Seeded tutor: ${data.name} with status ${data.status}`);
    } catch (err: any) {
      console.error(`Error seeding ${data.name}:`, err.message);
    }
  }

  console.log('Seeding complete.');
  await mongoose.disconnect();
}

seedUnverifiedTutors().catch(err => {
  console.error(err);
  process.exit(1);
});
