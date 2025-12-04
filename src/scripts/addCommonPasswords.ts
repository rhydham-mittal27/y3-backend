import mongoose from 'mongoose';
import Student from '../models/Student';
import bcrypt from 'bcryptjs';
import { logInfo, logError } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const addCommonPasswordsToExistingStudents = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourshikshak');
    logInfo('Connected to MongoDB');

    // Find all students without passwords or with empty passwords
    const studentsWithoutPasswords = await Student.find({
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    });

    logInfo(`Found ${studentsWithoutPasswords.length} students without passwords`);

    // Update each student with a common password
    const commonPassword = 'Student@123'; // Common password for existing students
    const hashedCommonPassword = await bcrypt.hash(commonPassword, 10);

    for (const student of studentsWithoutPasswords) {
      student.password = hashedCommonPassword;
      student.isPasswordChanged = false; // Force password change on first login
      await student.save();
      logInfo(`Updated student: ${student.name} (${student.studentId}) with common password`);
    }

    // Also update students who have passwords but isPasswordChanged is not set
    const studentsWithUnsetPasswordFlag = await Student.find({
      password: { $exists: true, $ne: '' },
      isPasswordChanged: { $exists: false }
    });

    logInfo(`Found ${studentsWithUnsetPasswordFlag.length} students with unset password change flag`);

    for (const student of studentsWithUnsetPasswordFlag) {
      student.isPasswordChanged = false;
      await student.save();
      logInfo(`Updated password change flag for student: ${student.name} (${student.studentId})`);
    }

    logInfo('Successfully updated all existing students');
    
    // Summary
    const totalStudents = await Student.countDocuments();
    const studentsWithPasswords = await Student.countDocuments({ 
      password: { $exists: true, $ne: '' } 
    });
    const studentsNeedingPasswordChange = await Student.countDocuments({ 
      isPasswordChanged: false 
    });

    logInfo('\n=== SUMMARY ===');
    logInfo(`Total students: ${totalStudents}`);
    logInfo(`Students with passwords: ${studentsWithPasswords}`);
    logInfo(`Students needing password change: ${studentsNeedingPasswordChange}`);
    logInfo('Common password for existing students: Student@123');

  } catch (error) {
    logError(`Error updating students: ${(error as Error).message}`);
  } finally {
    await mongoose.disconnect();
    logInfo('Disconnected from MongoDB');
  }
};

// Run the script
addCommonPasswordsToExistingStudents();
