import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Option from '../models/Option';

dotenv.config();

const SUBJECT_TYPE = 'SUBJECT';

const subjects: { label: string; value: string; sortOrder: number }[] = [
  { label: 'Mathematics',      value: 'MATHEMATICS',      sortOrder: 1 },
  { label: 'Physics',          value: 'PHYSICS',          sortOrder: 2 },
  { label: 'Chemistry',        value: 'CHEMISTRY',        sortOrder: 3 },
  { label: 'Biology',          value: 'BIOLOGY',          sortOrder: 4 },
  { label: 'English',          value: 'ENGLISH',          sortOrder: 5 },
  { label: 'Hindi',            value: 'HINDI',            sortOrder: 6 },
  { label: 'Computer Science', value: 'COMPUTER_SCIENCE', sortOrder: 7 },
  { label: 'Social Studies',   value: 'SOCIAL_STUDIES',   sortOrder: 8 },
  { label: 'Economics',        value: 'ECONOMICS',        sortOrder: 9 },
  { label: 'Commerce',         value: 'COMMERCE',         sortOrder: 10 },
];

const run = async () => {
  try {
    await connectDB();

    for (const s of subjects) {
      const existing = await Option.findOne({ type: SUBJECT_TYPE, value: s.value });
      if (existing) {
        console.log(`Subject option already exists: ${s.value}`);
        continue;
      }

      await Option.create({
        type: SUBJECT_TYPE,
        label: s.label,
        value: s.value,
        sortOrder: s.sortOrder,
        isActive: true,
      });
      console.log(`Created subject option: ${s.value}`);
    }

    console.log('Subject options seeding completed.');
  } catch (err) {
    console.error('Error seeding subject options', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

run();
