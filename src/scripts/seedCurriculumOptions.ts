import 'dotenv/config';
import mongoose from 'mongoose';
import Option from '../models/Option';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  console.error('[seedCurriculum] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

const BOARDS = [
  { label: 'CBSE', value: 'CBSE' },
  { label: 'ICSE', value: 'ICSE' },
  { label: 'IGCSE', value: 'IGCSE' },
  { label: 'IB', value: 'IB' },
  { label: 'State Board', value: 'STATE_BOARD' }
];

const GRADES = [
  { label: 'Playgroup/Nursery', value: 'PLAYGROUP_NURSERY' },
  { label: 'LKG/UKG', value: 'LKG_UKG' },
  { label: 'Grade 1', value: 'GRADE_1' },
  { label: 'Grade 2', value: 'GRADE_2' },
  { label: 'Grade 3', value: 'GRADE_3' },
  { label: 'Grade 4', value: 'GRADE_4' },
  { label: 'Grade 5', value: 'GRADE_5' },
  { label: 'Grade 6', value: 'GRADE_6' },
  { label: 'Grade 7', value: 'GRADE_7' },
  { label: 'Grade 8', value: 'GRADE_8' },
  { label: 'Grade 9', value: 'GRADE_9' },
  { label: 'Grade 10', value: 'GRADE_10' },
  { label: 'Grade 11', value: 'GRADE_11' },
  { label: 'Grade 12', value: 'GRADE_12' },
  { label: 'College/University', value: 'COLLEGE_UNIVERSITY' }
];

const SUBJECTS = [
  // Core Academic
  { label: 'Mathematics', value: 'MATHEMATICS' },
  { label: 'Science', value: 'SCIENCE' },
  { label: 'Physics', value: 'PHYSICS' },
  { label: 'Chemistry', value: 'CHEMISTRY' },
  { label: 'Biology', value: 'BIOLOGY' },
  { label: 'English', value: 'ENGLISH' },
  { label: 'Hindi', value: 'HINDI' },
  { label: 'Sanskrit', value: 'SANSKRIT' },
  { label: 'Social Studies', value: 'SOCIAL_STUDIES' },
  { label: 'History', value: 'HISTORY' },
  { label: 'Geography', value: 'GEOGRAPHY' },
  { label: 'Civics/Political Science', value: 'POLITICAL_SCIENCE' },
  { label: 'Economics', value: 'ECONOMICS' },
  
  // High School Specific
  { label: 'Accountancy', value: 'ACCOUNTANCY' },
  { label: 'Business Studies', value: 'BUSINESS_STUDIES' },
  { label: 'Psychology', value: 'PSYCHOLOGY' },
  { label: 'Sociology', value: 'SOCIOLOGY' },
  { label: 'Computer Science', value: 'COMPUTER_SCIENCE' },
  { label: 'Informatics Practices', value: 'INFORMATICS_PRACTICES' },
  { label: 'Applied Mathematics', value: 'APPLIED_MATHEMATICS' },

  // Extracurricular/Hobbies
  { label: 'Coding/Robotics', value: 'CODING_ROBOTICS' },
  { label: 'Chess', value: 'CHESS' },
  { label: 'Music (Instrumental)', value: 'MUSIC_INSTRUMENTAL' },
  { label: 'Music (Vocal)', value: 'MUSIC_VOCAL' },
  { label: 'Dance', value: 'DANCE' },
  { label: 'Art and Craft', value: 'ART_CRAFT' },
  { label: 'Public Speaking', value: 'PUBLIC_SPEAKING' },
  { label: 'Yoga', value: 'YOGA' }
];

async function seedType(type: string, data: { label: string; value: string }[]) {
  console.log(`Seeding ${type}...`);
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    await Option.findOneAndUpdate(
      { type, value: item.value },
      {
        type,
        label: item.label,
        value: item.value,
        sortOrder: i + 1,
        isActive: true
      },
      { upsert: true, new: true }
    );
  }
}

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await seedType('BOARD', BOARDS);
  await seedType('GRADE', GRADES);
  await seedType('SUBJECT', SUBJECTS);

  console.log('✅ Curriculum options seeded successfully');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Failed to seed curriculum options', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
