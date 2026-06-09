import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import ParentLead from '../models/ParentLead';
import { registerParentUser, getParentProfile } from '../services/parentService';
import { AuthRequest } from '../types';

/**
 * POST /api/v1/parent-leads
 * Public — no auth required.
 * Saves basic parent + student details as a sales lead for the team to follow up.
 */
export const registerParentLead = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const { parentName, parentEmail, parentPhone, studentName, studentGrade, city, notes } = req.body;

  const lead = await ParentLead.create({
    parentName,
    parentEmail,
    parentPhone,
    studentName,
    studentGrade: studentGrade || undefined,
    city: city || undefined,
    notes: notes || undefined,
    source: 'MOBILE_APP',
    status: 'NEW',
  });

  return res.status(201).json(
    successResponse(
      { id: lead._id, parentName: lead.parentName, studentName: lead.studentName, createdAt: lead.createdAt },
      'Registration successful! Our team will contact you shortly.'
    )
  );
});

/**
 * POST /api/v1/parents/register
 * Public — creates a User (role=PARENT) + Parent profile, returns tokens.
 */
export const registerParent = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const result = await registerParentUser(req.body);

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.status(201).json(
    successResponse(
      { user: result.user, parent: result.parent, accessToken: result.accessToken },
      'Parent account created successfully.'
    )
  );
});

/**
 * GET /api/v1/parents/me
 * Protected — returns the authenticated parent's profile.
 */
export const getMyParentProfile = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ErrorResponse('Not authenticated', 401);

  const parent = await getParentProfile(userId);
  return res.status(200).json(successResponse(parent, 'Parent profile fetched successfully.'));
});

export default { registerParentLead, registerParent, getMyParentProfile };
