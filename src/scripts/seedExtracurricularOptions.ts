import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Option from '../models/Option';

dotenv.config();

const TYPE = 'EXTRACURRICULAR';

const activities: { label: string; value: string; sortOrder: number }[] = [
  { label: 'Guitar', value: 'GUITAR', sortOrder: 1 },
  { label: 'Piano', value: 'PIANO', sortOrder: 2 },
  { label: 'Singing', value: 'SINGING', sortOrder: 3 },
  { label: 'Dance', value: 'DANCE', sortOrder: 4 },
  { label: 'Football', value: 'FOOTBALL', sortOrder: 5 },
  { label: 'Cricket', value: 'CRICKET', sortOrder: 6 },
  { label: 'Basketball', value: 'BASKETBALL', sortOrder: 7 },
  { label: 'Drawing', value: 'DRAWING', sortOrder: 8 },
  { label: 'Painting', value: 'PAINTING', sortOrder: 9 },
  { label: 'Yoga', value: 'YOGA', sortOrder: 10 },
];

const run = async () => {
  try {
    await connectDB();

    for (const a of activities) {
      const existing = await Option.findOne({ type: TYPE, value: a.value });
      if (existing) {
        console.log(`Extracurricular option already exists: ${a.value}`);
        continue;
      }

      await Option.create({
        type: TYPE,
        label: a.label,
        value: a.value,
        sortOrder: a.sortOrder,
        isActive: true,
      });
      console.log(`Created extracurricular option: ${a.value}`);
    }

    console.log('Extracurricular options seeding completed.');
  } catch (err) {
    console.error('Error seeding extracurricular options', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

run();
