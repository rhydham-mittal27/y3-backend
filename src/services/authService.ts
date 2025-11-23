import User from '../models/User';
import Tutor from '../models/Tutor';
import ErrorResponse from '../utils/errorResponse';
import { verifyRefreshToken } from '../utils/jwtUtils';
import { USER_ROLES } from '../config/constants';
import { computeTutorMonthlyStats } from './finalClassService';

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  phone?: string,
  role?: string
) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ErrorResponse('User already exists', 409);
  }

  const user = new User({ name, email, password, phone, role });
  await user.save();

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save();

  // Update tutor monthlyStats on login
  if (user.role === USER_ROLES.TUTOR) {
    try {
      const stats = await computeTutorMonthlyStats((user as any).id);
      await Tutor.updateOne(
        { user: user._id },
        { $set: { monthlyStats: stats } }
      );
    } catch (e) {
      // do not block login on stats update failure
      console.error('Failed to update tutor monthlyStats on login', e);
    }
  }

  // Update tutor monthlyStats on login
  if (user.role === USER_ROLES.TUTOR) {
    try {
      const stats = await computeTutorMonthlyStats((user as any).id);
      await Tutor.updateOne(
        { user: user._id },
        { $set: { monthlyStats: stats } }
      );
    } catch (e) {
      // do not block login on stats update failure
      console.error('Failed to update tutor monthlyStats on login', e);
    }
  }

  // Update tutor monthlyStats on login
  if (user.role === USER_ROLES.TUTOR) {
    try {
      const stats = await computeTutorMonthlyStats((user as any).id);
      await Tutor.updateOne(
        { user: user._id },
        { $set: { monthlyStats: stats } }
      );
    } catch (e) {
      // do not block login on stats update failure
      console.error('Failed to update tutor monthlyStats', e);
    }
  }

  const safeUser = {
    id: (user as any).id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, tokens: { accessToken, refreshToken } };
};

export const loginUser = async (email: string, password: string) => {
  console.log('[loginUser] Attempting login for email:', email);
  const user = await User.findOne({ email }).select('+password +refreshToken');
  console.log('[loginUser] User lookup result:', user ? { id: (user as any).id, email: user.email, role: user.role } : null);
  if (!user) {
    console.log('[loginUser] No user found for email, throwing Invalid credentials');
    throw new ErrorResponse('Invalid credentials', 401);
  }

  const isMatch = await user.comparePassword(password);
  console.log('[loginUser] Password match result for user', (user as any).id, ':', isMatch);
  if (!isMatch) {
    console.log('[loginUser] Password mismatch, throwing Invalid credentials');
    throw new ErrorResponse('Invalid credentials', 401);
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save();

  const safeUser = {
    id: (user as any).id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, tokens: { accessToken, refreshToken } };
};

export const refreshAccessToken = async (refreshToken: string) => {
  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId).select('+refreshToken');
  if (!user || !user.refreshToken) {
    throw new ErrorResponse('Not authorized', 401);
  }
  if (user.refreshToken !== refreshToken) {
    throw new ErrorResponse('Invalid refresh token', 401);
  }

  const accessToken = user.generateAccessToken();
  return { accessToken };
};

export const logoutUser = async (userId: string) => {
  await User.findByIdAndUpdate(userId, { $set: { refreshToken: null } });
  return { success: true };
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ErrorResponse('Current password is incorrect', 400);
  }

  user.password = newPassword;
  await user.save();

  return { success: true, message: 'Password changed successfully' };
};
