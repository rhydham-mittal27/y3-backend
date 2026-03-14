import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { verifyAccessToken } from '../utils/jwtUtils';
import User from '../models/User';
import * as mongoose from 'mongoose';
import Student from '../models/Student';
import Manager from '../models/Manager';
import Coordinator from '../models/Coordinator';
import { AuthRequest } from '../types';

export const protect = asyncHandler(async (req: AuthRequest, _res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new ErrorResponse('Not authorized, no token', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    // First, try to authenticate as a regular User
    const user = await User.findById(decoded.userId).select('-password -refreshToken');

    if (user && user.isActive !== false) {
      let isProfileComplete: boolean | undefined;
      let verificationStatus: string | undefined;
      let preferredMode: string | undefined;
      let city: string | undefined;
      let permissions: any = undefined;

      if (user.role === 'TUTOR') {
        const TutorModel = mongoose.model('Tutor');
        const tutor = await TutorModel.findOne({ user: user._id });
        if (tutor) {
          preferredMode = (tutor as any).preferredMode;
          city = (tutor as any).preferredLocations?.[0]; // Default city
          verificationStatus = (tutor as any).verificationStatus;
        }
      }
      
      if (user.role === 'MANAGER') {
        const manager = await Manager.findOne({ user: user._id });
        if (manager) {
          verificationStatus = (manager as any).verificationStatus;
          isProfileComplete = (manager as any).isProfileComplete;
          permissions = {
            canViewSiteLeads: (manager as any).permissions?.canViewSiteLeads ?? false,
            canVerifyTutors: (manager as any).permissions?.canVerifyTutors ?? false,
            canCreateLeads: (manager as any).permissions?.canCreateLeads ?? false,
          };
        }
      }

      if (user.role === 'COORDINATOR') {
        const coordinator = await Coordinator.findOne({ user: user._id });
        if (coordinator) {
          verificationStatus = (coordinator as any).verificationStatus;
        }
      }

      req.user = {
        id: (user as any).id as string,
        name: user.name,
        email: user.email,
        role: user.role as string,
        phone: user.phone || '',
        dob: (user as any).dob,
        isActive: user.isActive,
        acceptedTerms: user.acceptedTerms || false,
        preferredMode,
        city,
        verificationStatus,
        isProfileComplete,
        permissions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      next();
      return;
    }

    // If no active User found, try authenticating as a Student
    const student = await Student.findById(decoded.userId).select('-password');
    if (!student) {
      throw new ErrorResponse('Not authorized', 401);
    }

    req.user = {
      id: (student as any)._id.toString(),
      name: student.name,
      email: student.studentId,
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

export default protect;
