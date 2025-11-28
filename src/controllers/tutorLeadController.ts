import { Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { successResponse } from '../utils/responseFormatter';
import User from '../models/User';
import Tutor from '../models/Tutor';
import generateTeacherId from '../utils/generateTeacherId';
import { USER_ROLES } from '../config/constants';

function parseExperienceHours(experience: string | undefined): number {
  if (!experience) return 0;
  // Extract first number and a unit hint (years/months)
  const num = Number((experience.match(/\d+/)?.[0] ?? '0'));
  if (!isFinite(num) || num <= 0) return 0;
  if (/year/i.test(experience)) return num * 12 * 30; // approximate hours (12 months * 30 days) if needed
  if (/month/i.test(experience)) return num * 30; // approximate
  return num; // fallback raw number
}

export const createTutorLeadRegistrationController = asyncHandler(async (req: Request, res: Response) => {
  const {
    fullName,
    gender,
    phoneNumber,
    email,
    qualification,
    experience,
    subjects,
    city,
    preferredAreas,
    pincode,
    password,
  } = req.body as {
    fullName: string;
    gender?: string;
    phoneNumber: string;
    email: string;
    qualification?: string;
    experience?: string;
    subjects: string[];
    city: string;
    preferredAreas: string[];
    pincode?: string;
    password: string;
  };

  // Basic validation
  if (!fullName || !email || !password) {
    throw new ErrorResponse('Full name, email and password are required', 400);
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new ErrorResponse('At least one subject must be selected', 400);
  }

  // Check if user already exists
  const existing = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();
  if (existing) {
    throw new ErrorResponse('An account with this email already exists', 409);
  }

  // Create user (role TUTOR). User model hashes password in pre-save hook.
  const user = new User({
    name: fullName,
    email: String(email).toLowerCase().trim(),
    password,
    phone: phoneNumber,
    role: USER_ROLES.TUTOR,
  });
  await user.save();

  // Create tutor profile
  const experienceHours = parseExperienceHours(experience);
  const preferredLocations: string[] = [];
  if (city) preferredLocations.push(city);
  if (Array.isArray(preferredAreas)) preferredAreas.forEach((a: string) => {
    if (a && a.trim()) preferredLocations.push(a.trim());
  });
  if (pincode) preferredLocations.push(String(pincode));

  // Determine teacherId: prefer client's provided teacherId, otherwise generate server-side.
  let teacherIdToSave = (req.body && (req.body as any).teacherId) ? String((req.body as any).teacherId).trim() : '';
  // Ensure uniqueness: if provided and already exists, ignore and generate a new unique id.
  if (teacherIdToSave) {
    const existingWithProvided = await Tutor.findOne({ teacherId: teacherIdToSave }).lean();
    if (existingWithProvided) {
      teacherIdToSave = '';
    }
  }

  // If we don't have a teacherId yet, generate and ensure uniqueness with retries
  const MAX_RETRIES = 5;
  let attempts = 0;
  while (!teacherIdToSave && attempts < MAX_RETRIES) {
    attempts += 1;
    const candidate = generateTeacherId(gender, city);
    const exists = await Tutor.findOne({ teacherId: candidate }).lean();
    if (!exists) {
      teacherIdToSave = candidate;
      break;
    }
  }

  // Fallback: if still empty (very unlikely), use the Mongo id string after creation.

  const tutorPayload: any = {
    user: user._id,
    experienceHours,
    subjects: subjects.map(String),
    qualifications: qualification ? [qualification] : [],
    preferredLocations,
  };
  if (teacherIdToSave) tutorPayload.teacherId = teacherIdToSave;

  const tutor = await Tutor.create(tutorPayload);

  const returnTeacherId = tutor.teacherId || String(tutor._id);
  return res.status(201).json(successResponse({ teacherId: returnTeacherId }, 'Tutor registered successfully'));
});
