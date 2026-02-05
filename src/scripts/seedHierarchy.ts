import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';
import { BOARD_TYPE } from '../config/constants';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const GRADES = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
];

const COMMON_SUBJECTS = ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science'];
const HIGHER_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Computer Science', 'Accountancy', 'Economics', 'Business Studies'];

const seedHierarchy = async () => {
  await connectDB();

  try {
    // 1. Boards
    const boards = Object.values(BOARD_TYPE);
    
    for (const board of boards) {
      console.log(`Processing Board: ${board}`);
      const boardOption = await Option.findOneAndUpdate(
        { type: 'BOARD', value: board },
        { 
          type: 'BOARD', 
          value: board, 
          label: board.replace(/_/g, ' '), 
          isActive: true 
        },
        { upsert: true, new: true }
      );

      // 2. Grades for this Board
      for (const grade of GRADES) {
        const gradeValue = `${board}_${grade}`;
        const gradeLabel = `Class ${grade}`;
        
        const gradeOption = await Option.findOneAndUpdate(
          { type: 'GRADE', value: gradeValue },
          { 
            type: 'GRADE', 
            value: gradeValue, 
            label: gradeLabel, 
            parent: boardOption._id,
            isActive: true,
            sortOrder: parseInt(grade)
          },
          { upsert: true, new: true }
        );

        // 3. Subjects for this Grade
        const subjects = parseInt(grade) > 10 ? HIGHER_SUBJECTS : COMMON_SUBJECTS;
        
        for (const subject of subjects) {
          const subjectValue = `${gradeValue}_${subject.toUpperCase().replace(/\s+/g, '_')}`;
          
          await Option.findOneAndUpdate(
            { type: 'SUBJECT', value: subjectValue },
            { 
              type: 'SUBJECT', 
              value: subjectValue, 
              label: subject, 
              parent: gradeOption._id,
              isActive: true 
            },
            { upsert: true, new: true }
          );
        }
      }
    }
    console.log('✅ Hierarchy seeded successfully');
  } catch (error) {
    console.error('Error seeding hierarchy:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

seedHierarchy();
