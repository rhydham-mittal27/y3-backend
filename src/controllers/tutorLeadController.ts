import { Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { successResponse } from '../utils/responseFormatter';
import User from '../models/User';
import Tutor from '../models/Tutor';
import generateTeacherId, { generateTeacherIdWithCityCode } from '../utils/generateTeacherId';
import Option from '../models/Option';
import { TEACHING_MODE, USER_ROLES } from '../config/constants';
import { sendLoginOtp } from '../services/authService';
import { sendTutorRegistrationEmail } from '../services/tutorEmailService';
import crypto from 'crypto';

function parseExperience(experience: string | undefined): { hours: number; years: number } {
  if (!experience) return { hours: 0, years: 0 };
  const num = Number((experience.match(/\d+/)?.[0] ?? '0'));
  if (!isFinite(num) || num <= 0) return { hours: 0, years: 0 };

  if (/year/i.test(experience)) {
    return {
      hours: num * 12 * 30, // approximate hours
      years: num
    };
  }
  if (/month/i.test(experience)) {
    return {
      hours: num * 30,
      years: Math.round((num / 12) * 10) / 10 // rounded to 1 decimal
    };
  }
  return { hours: num, years: 0 };
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
    password,
    extracurricularActivities,
    preferredMode,
    permanentAddress,
    residentialAddress,
    alternatePhone,
    bio,
    languagesKnown,
    skills,
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
    password: string;
    extracurricularActivities?: string[];
    preferredMode?: string;
    permanentAddress?: string;
    residentialAddress?: string;
    alternatePhone?: string;
    bio?: string;
    languagesKnown?: string[];
    skills?: string[];
  };

  // Basic validation
  if (!fullName || !email || !password || !preferredMode) {
    throw new ErrorResponse('Full name, email, password and preferred mode are required', 400);
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new ErrorResponse('At least one subject must be selected', 400);
  }

  // Check if user already exists
  const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existing) {
    throw new ErrorResponse('An account with this email already exists', 409);
  }

  // Check if phone number already exists
  const existingPhone = await User.findOne({ phone: phoneNumber });
  if (existingPhone) {
    throw new ErrorResponse('An account with this phone number already exists', 409);
  }

  // Create user (role TUTOR). User model hashes password in pre-save hook.
  const user = new User({
    name: fullName,
    email: String(email).toLowerCase().trim(),
    password,
    phone: phoneNumber,
    gender,
    city,
    preferredMode,
    role: USER_ROLES.TUTOR,
  });
  await user.save();

  // Create tutor profile
  const { hours: experienceHours, years: yearsOfExperience } = parseExperience(experience);
  const preferredLocations: string[] = [];
  const preferredCities: string[] = [];

  if (city) {
    preferredLocations.push(city);
    preferredCities.push(city);
  }

  if (Array.isArray(preferredAreas)) preferredAreas.forEach((a: string) => {
    if (a && a.trim()) preferredLocations.push(a.trim());
  });

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

  let cityCode: string | undefined;
  if (city) {
    const normalizedCityValue = String(city).trim().toUpperCase().replace(/\s+/g, '_');
    const cityOpt = await Option.findOne({ type: 'CITY', $or: [{ value: normalizedCityValue }, { label: String(city).trim() }] }).lean();
    cityCode = (cityOpt as any)?.metadata?.cityCode ? String((cityOpt as any).metadata.cityCode) : undefined;
  }

  while (!teacherIdToSave && attempts < MAX_RETRIES) {
    attempts += 1;
    const candidate = cityCode ? generateTeacherIdWithCityCode(gender, cityCode, city) : generateTeacherId(gender, city);
    const exists = await Tutor.findOne({ teacherId: candidate }).lean();
    if (!exists) {
      teacherIdToSave = candidate;
      break;
    }
  }

  const tutorPayload: any = {
    user: user._id,
    experienceHours,
    yearsOfExperience,
    subjects: subjects.map(String),
    qualifications: qualification ? [qualification] : [],
    preferredLocations,
    preferredCities,
    preferredMode,
    permanentAddress,
    residentialAddress,
    alternatePhone,
    bio,
    languagesKnown: languagesKnown || [],
    skills: skills || [],
  };
  if (Array.isArray(extracurricularActivities) && extracurricularActivities.length) {
    tutorPayload.extracurricularActivities = extracurricularActivities.map(String);
  }
  if (teacherIdToSave) tutorPayload.teacherId = teacherIdToSave;

  const tutor = await Tutor.create(tutorPayload);

  // Send welcome email to newly registered tutor
  const returnTeacherId = tutor.teacherId || String(tutor._id);
  await sendTutorRegistrationEmail(user.email, user.name, returnTeacherId);

  return res.status(201).json(successResponse({ teacherId: returnTeacherId }, 'Tutor registered successfully'));
});

export const createTutorLeadOtpLaterController = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    phone,
    email,
    teachingMode,
    city,
    areas,
    boards,
    classes,
    extracurriculars,
    experience,
    note,
  } = req.body as any;

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!name || !normalizedEmail || !phone) {
    throw new ErrorResponse('Name, email and phone are required', 400);
  }

  let preferredMode: string | undefined;
  const modeLower = String(teachingMode || '').toLowerCase();
  if (modeLower === 'online') preferredMode = TEACHING_MODE.ONLINE;
  else if (modeLower === 'offline') preferredMode = TEACHING_MODE.OFFLINE;
  else if (modeLower === 'both') preferredMode = TEACHING_MODE.HYBRID;
  else preferredMode = TEACHING_MODE.OFFLINE;

  // If user already exists, just trigger OTP flow
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const otpRes = await sendLoginOtp(normalizedEmail);
    return res.status(200).json(successResponse({ otp: otpRes }, 'OTP sent successfully'));
  }

  const existingPhone = await User.findOne({ phone: String(phone) });
  if (existingPhone) {
    throw new ErrorResponse('An account with this phone number already exists', 409);
  }

  const password = crypto.randomBytes(16).toString('hex');

  const user = new User({
    name: String(name).trim(),
    email: normalizedEmail,
    password,
    phone: String(phone).trim(),
    city: city ? String(city).trim() : undefined,
    preferredMode,
    role: USER_ROLES.TUTOR,
  } as any);
  await user.save();

  const preferredLocations: string[] = [];
  const preferredCities: string[] = [];
  if (city) {
    preferredLocations.push(String(city));
    preferredCities.push(String(city));
  }
  if (Array.isArray(areas)) {
    areas.forEach((a: any) => {
      if (a && String(a).trim()) preferredLocations.push(String(a).trim());
    });
  }

  const { hours: experienceHours, years: yearsOfExperience } = parseExperience(String(experience || ''));

  const tutorPayload: any = {
    user: user._id,
    experienceHours,
    yearsOfExperience,
    preferredLocations,
    preferredCities,
    preferredMode,
    subjects: ['All Subjects'],
    qualifications: Array.isArray(boards) && boards.length ? boards.map(String) : [],
    extracurricularActivities: Array.isArray(extracurriculars) ? extracurriculars.map(String) : [],
    skills: Array.isArray(classes) ? classes.map(String) : [],
    languagesKnown: [],
    bio: note ? String(note).slice(0, 500) : undefined,
  };

  // Generate teacherId
  let cityCode: string | undefined;
  if (city) {
    const normalizedCityValue = String(city).trim().toUpperCase().replace(/\s+/g, '_');
    const cityOpt = await Option.findOne({ type: 'CITY', $or: [{ value: normalizedCityValue }, { label: String(city).trim() }] }).lean();
    cityCode = (cityOpt as any)?.metadata?.cityCode ? String((cityOpt as any).metadata.cityCode) : undefined;
  }

  const candidate = cityCode
    ? generateTeacherIdWithCityCode(undefined, cityCode, city ? String(city) : undefined)
    : generateTeacherId(undefined, city ? String(city) : undefined);
  const exists = await Tutor.findOne({ teacherId: candidate }).lean();
  if (!exists) {
    tutorPayload.teacherId = candidate;
  }

  const savedTutor = await Tutor.create(tutorPayload);

  // Send welcome email for OTP-later registration path
  const savedTeacherId = (savedTutor as any).teacherId || String((savedTutor as any)._id);
  await sendTutorRegistrationEmail(user.email, user.name, savedTeacherId);

  const otpRes = await sendLoginOtp(normalizedEmail);
  return res.status(201).json(successResponse({ otp: otpRes }, 'Tutor application submitted. OTP sent.'));
});
