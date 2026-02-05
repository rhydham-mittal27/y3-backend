import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { verifyAccessToken } from '../utils/jwtUtils';
import Student from '../models/Student';
import { AuthRequest } from '../types';

export const protectStudent = asyncHandler(async (req: AuthRequest, _res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new ErrorResponse('Not authorized, no token', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    
    // For students, find in Student model instead of User model
    const student = await Student.findById(decoded.userId).select('-password');
    if (!student) {
      throw new ErrorResponse('Student not found', 401);
    }

    req.user = {
      id: (student as any)._id.toString(),
      name: student.name,
      email: student.studentId, // Use studentId as email for consistency
      role: 'STUDENT',
      phone: '',
      isActive: true,
      acceptedTerms: true, // Students don't have TnC popup yet
      preferredMode: undefined,
      city: undefined,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    };

    next();
  } catch (err) {
    throw new ErrorResponse('Not authorized, token failed', 401);
  }
});

export default protectStudent;
