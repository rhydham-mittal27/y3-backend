import mongoose from 'mongoose';
import Student from '../models/Student';
import ClassLead from '../models/ClassLead';
import FinalClass from '../models/FinalClass';
import { sendStudentCredentialsEmail } from '../services/studentEmailService';
import { logInfo, logError, logWarn } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const sendCredentialsToExistingParents = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourshikshak');
    logInfo('Connected to MongoDB');

    // Find all students
    const students = await Student.find().populate('classLead');
    logInfo(`Found ${students.length} students`);

    for (const student of students) {
      try {
        // Get class lead and final class information
        const classLead = await ClassLead.findById(student.classLead);
        const finalClass = await FinalClass.findById(student.finalClass);

        if (classLead && classLead.parentEmail) {
          await sendStudentCredentialsEmail({
            parentEmail: classLead.parentEmail,
            studentName: student.name,
            className: finalClass?.className || `Class ${student.grade}`,
            studentId: student.studentId,
            password: 'Student@123' // Common password for existing students
          });
          logInfo(`Sent credentials email to parent of ${student.name} (${student.studentId})`);
        } else {
          logWarn(`No parent email found for student: ${student.name} (${student.studentId})`);
        }
      } catch (emailError) {
        logError(`Failed to send email for student ${student.name}: ${(emailError as Error).message}`);
      }
    }

    logInfo('Completed sending credentials emails to parents');

  } catch (error) {
    logError(`Error sending emails: ${(error as Error).message}`);
  } finally {
    await mongoose.disconnect();
    logInfo('Disconnected from MongoDB');
  }
};

// Run the script
sendCredentialsToExistingParents();
