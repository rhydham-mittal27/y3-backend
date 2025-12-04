import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { registerUser, loginUser, refreshAccessToken, logoutUser, changePassword, sendLoginOtp, verifyLoginOtp, getParentEmailByClassName } from '../services/authService';
import { createManagerProfile } from '../services/managerService';
import { createCoordinator } from '../services/coordinatorService';
import { USER_ROLES } from '../config/constants';
import { AuthRequest } from '../types';

export const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { name, email, password, phone, role } = req.body;
  const result = await registerUser(name, email, password, phone, role);

  // Automatically create profiles for staff roles where possible
  try {
    const userId = (result as any)?.user?.id as string | undefined;

    if (userId && role === USER_ROLES.MANAGER) {
      await createManagerProfile(userId);
    } else if (userId && role === USER_ROLES.COORDINATOR) {
      await createCoordinator(userId);
    }
  } catch (e) {
    // If profile creation fails for some reason, surface a clear error
    throw new ErrorResponse((e as any)?.message || 'Failed to create staff profile', 400);
  }

  return res.status(201).json(successResponse(result, 'User registered successfully'));
});

export const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { email, password } = req.body;
  const result = await loginUser(email, password);
  return res.status(200).json(successResponse(result, 'Login successful'));
});

export const sendLoginOtpHandler = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { email } = req.body as { email: string };
  const result = await sendLoginOtp(email);
  return res.status(200).json(successResponse(result, 'OTP sent successfully'));
});

export const verifyLoginOtpHandler = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { email, otp } = req.body as { email: string; otp: string };
  const result = await verifyLoginOtp(email, otp);
  return res.status(200).json(successResponse(result, 'Login successful'));
});

export const parentLoginLookupHandler = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { className } = req.body as { className: string };
  const result = await getParentEmailByClassName(className);
  return res.status(200).json(successResponse(result, 'Parent email found'));
});

export const refreshToken = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { refreshToken } = req.body as { refreshToken: string };
  const result = await refreshAccessToken(refreshToken);
  return res.status(200).json(successResponse(result, 'Access token refreshed'));
});

export const logout = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  await logoutUser(req.user.id);
  return res.status(200).json(successResponse({ success: true }, 'Logged out successfully'));
});

export const getMe = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  return res.status(200).json(successResponse(req.user, 'Fetched current user'));
});

export const changePasswordHandler = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  const result = await changePassword(req.user.id, currentPassword, newPassword);
  return res.status(200).json(successResponse(result, 'Password changed successfully'));
});
