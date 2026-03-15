import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Option from '../models/Option';

dotenv.config();

const TYPE = 'EXTRACURRICULAR_ACTIVITY';

const activities: { label: string; value: string; sortOrder: number }[] = [
  { label: 'Cricket', value: 'CRICKET', sortOrder: 1 },
  { label: 'Football', value: 'FOOTBALL', sortOrder: 2 },
  { label: 'Basketball', value: 'BASKETBALL', sortOrder: 3 },
  { label: 'Badminton', value: 'BADMINTON', sortOrder: 4 },
  { label: 'Tennis', value: 'TENNIS', sortOrder: 5 },
  { label: 'Table Tennis', value: 'TABLE_TENNIS', sortOrder: 6 },
  { label: 'Swimming', value: 'SWIMMING', sortOrder: 7 },
  { label: 'Athletics', value: 'ATHLETICS', sortOrder: 8 },
  { label: 'Chess', value: 'CHESS', sortOrder: 9 },
  { label: 'Yoga', value: 'YOGA', sortOrder: 10 },
  { label: 'Dance', value: 'DANCE', sortOrder: 11 },
  { label: 'Public Speaking', value: 'PUBLIC_SPEAKING', sortOrder: 12 },
  { label: 'Debate', value: 'DEBATE', sortOrder: 13 },
  { label: 'Guitar', value: 'GUITAR', sortOrder: 14 },
  { label: 'Piano', value: 'PIANO', sortOrder: 15 },
  { label: 'Drawing', value: 'DRAWING', sortOrder: 16 },
  { label: 'Painting', value: 'PAINTING', sortOrder: 17 },
  { label: 'Coding', value: 'CODING', sortOrder: 18 },
  { label: 'Robotics', value: 'ROBOTICS', sortOrder: 19 },
  { label: 'Photography', value: 'PHOTOGRAPHY', sortOrder: 20 },
];

const run = async () => {
  try {
    await connectDB();

    for (const a of activities) {
      await Option.findOneAndUpdate(
        { type: TYPE, value: a.value, parent: null },
        {
          type: TYPE,
          label: a.label,
          value: a.value,
          sortOrder: a.sortOrder,
          isActive: true,
          parent: null,
        },
        { upsert: true, new: true }
      );
      console.log(`Upserted extracurricular option: ${a.value}`);
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
