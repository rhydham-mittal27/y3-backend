import User from '../models/User';
import ErrorResponse from '../utils/errorResponse';
import { verifyRefreshToken } from '../utils/jwtUtils';

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
  const user = await User.findOne({ email }).select('+password +refreshToken');
  if (!user) {
    throw new ErrorResponse('Invalid credentials', 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
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
