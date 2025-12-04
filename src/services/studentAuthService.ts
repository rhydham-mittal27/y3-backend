import Student from '../models/Student';
import bcrypt from 'bcryptjs';
import ErrorResponse from '../utils/errorResponse';

export interface StudentLoginCredentials {
  studentId: string;
  password: string;
}

export const studentLogin = async (credentials: StudentLoginCredentials) => {
  const { studentId, password } = credentials;

  // Find student by studentId
  const student = await Student.findOne({ studentId });
  if (!student) {
    throw new ErrorResponse('Invalid student ID or password', 401);
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, student.password);
  if (!isPasswordValid) {
    throw new ErrorResponse('Invalid student ID or password', 401);
  }

  // Return student data without password
  const studentData = {
    id: student._id,
    studentId: student.studentId,
    name: student.name,
    gender: student.gender,
    grade: student.grade,
    finalClass: student.finalClass,
    classLead: student.classLead,
    isPasswordChanged: student.isPasswordChanged,
  };

  return {
    student: studentData,
    requiresPasswordChange: !student.isPasswordChanged,
  };
};

export const changeStudentPassword = async (
  studentId: string,
  currentPassword: string,
  newPassword: string
) => {
  const student = await Student.findOne({ studentId });
  if (!student) {
    throw new ErrorResponse('Student not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, student.password);
  if (!isCurrentPasswordValid) {
    throw new ErrorResponse('Current password is incorrect', 400);
  }

  // Validate new password strength
  const { validatePassword } = await import('../utils/passwordValidator');
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new ErrorResponse(
      `Password validation failed: ${passwordValidation.errors.join(', ')}`,
      400
    );
  }

  // Check if new password is same as current
  const isSamePassword = await bcrypt.compare(newPassword, student.password);
  if (isSamePassword) {
    throw new ErrorResponse('New password must be different from current password', 400);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedNewPassword = await bcrypt.hash(newPassword, salt);

  // Update password and mark as changed
  student.password = hashedNewPassword;
  student.isPasswordChanged = true;
  await student.save();

  return { message: 'Password changed successfully' };
};

export const resetStudentPassword = async (studentId: string) => {
  const student = await Student.findOne({ studentId });
  if (!student) {
    throw new ErrorResponse('Student not found', 404);
  }

  // Generate new random password
  const { generateStudentPassword } = await import('../utils/generatePassword');
  const newPassword = generateStudentPassword();

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update password and mark as not changed
  student.password = hashedPassword;
  student.isPasswordChanged = false;
  await student.save();

  return { newPassword, message: 'Password reset successfully' };
};
