import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { registerUser, loginUser, refreshAccessToken, logoutUser } from '../services/authService';
import { AuthRequest } from '../types';

export const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { name, email, password, phone, role } = req.body;
  const result = await registerUser(name, email, password, phone, role);
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
