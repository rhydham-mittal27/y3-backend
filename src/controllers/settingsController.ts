import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import {
  getUserPreferences,
  updateUserPreferences,
  resetUserPreferences,
  deleteUserPreferences,
} from '../services/settingsService';
import { AuthRequest } from '../types';

export const getPreferences = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const prefs = await getUserPreferences(req.user.id);
  return res.status(200).json(successResponse(prefs, 'Fetched user preferences'));
});

export const updatePreferences = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const updates = req.body;
  const prefs = await updateUserPreferences(req.user.id, updates);
  return res.status(200).json(successResponse(prefs, 'Updated user preferences'));
});

export const resetPreferences = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const prefs = await resetUserPreferences(req.user.id);
  return res.status(200).json(successResponse(prefs, 'Reset user preferences to defaults'));
});

export const deletePreferences = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const result = await deleteUserPreferences(req.user.id);
  return res.status(200).json(successResponse(result, 'Deleted user preferences'));
});
