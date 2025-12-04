import { Request, Response } from 'express';
import { studentLogin, changeStudentPassword } from '../services/studentAuthService';
import { generateTokens } from '../utils/jwtUtils';
import asyncHandler from '../utils/asyncHandler';

// Student login
export const loginStudent = asyncHandler(async (req: Request, res: Response) => {
  const { studentId, password } = req.body;

  if (!studentId || !password) {
    return res.status(400).json({
      success: false,
      message: 'Student ID and password are required',
    });
  }

  const result = await studentLogin({ studentId, password });

  // Generate JWT tokens for student
  const { accessToken, refreshToken } = generateTokens(
    result.student.id.toString(),
    result.student.studentId, // Use studentId as email for JWT
    'STUDENT'
  );

  return res.status(200).json({
    success: true,
    data: {
      ...result,
      accessToken,
      refreshToken,
    },
    message: result.requiresPasswordChange 
      ? 'Login successful. Please change your password.' 
      : 'Login successful',
  });
});

// Change student password
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { studentId, currentPassword, newPassword } = req.body;

  if (!studentId || !currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Student ID, current password, and new password are required',
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long',
    });
  }

  const result = await changeStudentPassword(studentId, currentPassword, newPassword);

  return res.status(200).json({
    success: true,
    data: result,
    message: 'Password changed successfully',
  });
});

// Get student profile
export const getStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;

  const Student = (await import('../models/Student')).default;
  const student = await Student.findOne({ studentId }).select('-password');

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  return res.status(200).json({
    success: true,
    data: student,
  });
});
