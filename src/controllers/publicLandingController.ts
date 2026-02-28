import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { createClassLead } from '../services/leadService';
import Manager from '../models/Manager';
import { BOARD_TYPE, LEAD_SOURCE, TEACHING_MODE, USER_ROLES } from '../config/constants';
import User from '../models/User';
import Tutor from '../models/Tutor';
import generateTeacherId from '../utils/generateTeacherId';
import crypto from 'crypto';

function normalizePhone(phone: unknown): string | undefined {
  const cleaned = String(phone || '').replace(/\D/g, '').slice(0, 10);
  if (cleaned.length === 10) return cleaned;
  return undefined;
}

function normalizeEmail(email: unknown): string | undefined {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return undefined;
  const isValid = /^\S+@\S+\.\S+$/.test(normalized);
  return isValid ? normalized : undefined;
}

function createPlaceholderEmail(): string {
  const token = crypto.randomBytes(12).toString('hex');
  return `landing-tutor-${token}@invalid.local`;
}

function mapTeachingMode(teachingMode: unknown): string {
  const modeLower = String(teachingMode || '').toLowerCase().trim();
  if (modeLower === 'online') return TEACHING_MODE.ONLINE;
  if (modeLower === 'both') return TEACHING_MODE.HYBRID;
  return TEACHING_MODE.OFFLINE;
}

async function resolveSiteLeadOwnerUserId(): Promise<string> {
  const explicit = String(process.env.SITE_LEAD_OWNER_USER_ID || '').trim();
  if (explicit) return explicit;

  const legacy = String(process.env.PUBLIC_LEAD_MANAGER_USER_ID || '').trim();
  if (legacy) return legacy;

  const admin = await User.findOne({ role: USER_ROLES.ADMIN }).select('_id').lean();
  if (admin && admin._id) return String(admin._id);

  // Last resort fallback: pick a random manager
  const managers = await Manager.find().populate('user');
  if (!managers || managers.length === 0) {
    throw new ErrorResponse('No user configured to own site leads', 500);
  }

  const randomIndex = Math.floor(Math.random() * managers.length);
  const chosenManager = managers[randomIndex];
  if (!chosenManager.user) {
    throw new ErrorResponse('Selected manager does not have an associated user', 500);
  }
  return String((chosenManager.user as any)._id || chosenManager.user);
}

export const createLandingParentLead = asyncHandler(async (req, res) => {
  const {
    parentName,
    phone,
    city,
    class: classLevel,
    subject,
    studentGender,
  } = req.body as any;

  const createdByUserId = await resolveSiteLeadOwnerUserId();

  const normalizedParentName = parentName ? String(parentName).trim() : undefined;
  const normalizedPhone = normalizePhone(phone);
  const normalizedCity = city ? String(city).trim() : undefined;
  const normalizedClass = classLevel ? String(classLevel).trim() : undefined;
  const normalizedSubject = subject ? String(subject).trim() : undefined;

  // Build a clean human-readable notes string (no JSON)
  const noteParts: string[] = [];
  if (normalizedCity) noteParts.push(`City: ${normalizedCity}`);
  if (normalizedClass) noteParts.push(`Class: ${normalizedClass}`);
  if (normalizedSubject) noteParts.push(`Subject: ${normalizedSubject}`);
  if (studentGender) noteParts.push(`Student Gender: ${studentGender}`);
  noteParts.push('Source: Website Landing Page');
  const notes = noteParts.join(' | ');

  const lead = await createClassLead({
    studentType: 'SINGLE',
    studentName: normalizedParentName || 'Unknown',
    studentGender: String(studentGender || 'M').toUpperCase() === 'F' ? 'F' : 'M',
    parentName: normalizedParentName,
    parentPhone: normalizedPhone,
    grade: normalizedClass || 'Unknown',
    subject: normalizedSubject ? [normalizedSubject] : ['All Subjects'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    city: normalizedCity,
    timing: 'Flexible',
    leadSource: LEAD_SOURCE.SITE,
    paymentReceived: false,
    notes,
    createdBy: createdByUserId,
  });

  return res.status(201).json(successResponse({ id: lead._id }, 'Lead submitted successfully'));
});

export const createLandingTutorApplication = asyncHandler(async (req, res) => {
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

  const normalizedName = name ? String(name).trim() : 'Unknown';
  const normalizedPhone = normalizePhone(phone);
  const realEmail = normalizeEmail(email);
  const emailToSave = realEmail || createPlaceholderEmail();
  const preferredMode = mapTeachingMode(teachingMode);

  const existing = await User.findOne({ email: emailToSave }).lean();
  if (existing) {
    throw new ErrorResponse('An account with this email already exists', 409);
  }

  if (normalizedPhone) {
    const existingPhone = await User.findOne({ phone: normalizedPhone }).lean();
    if (existingPhone) {
      throw new ErrorResponse('An account with this phone number already exists', 409);
    }
  }

  const password = crypto.randomBytes(16).toString('hex');

  const user = new User({
    name: normalizedName,
    email: emailToSave,
    password,
    phone: normalizedPhone,
    city: city ? String(city).trim() : undefined,
    preferredMode,
    role: 'TUTOR',
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

  const tutorPayload: any = {
    user: user._id,
    experienceHours: 0,
    yearsOfExperience: 0,
    preferredMode,
    preferredLocations,
    preferredCities,
    subjects: ['All Subjects'],
    qualifications: Array.isArray(boards) ? boards.map(String) : [],
    skills: Array.isArray(classes) ? classes.map(String) : [],
    extracurricularActivities: Array.isArray(extracurriculars) ? extracurriculars.map(String) : [],
    bio: note ? String(note).slice(0, 500) : undefined,
    languagesKnown: [],
  };

  const teacherCandidate = generateTeacherId(undefined, city ? String(city) : undefined);
  const existsTeacher = await Tutor.findOne({ teacherId: teacherCandidate }).lean();
  if (!existsTeacher) {
    tutorPayload.teacherId = teacherCandidate;
  }

  const tutor = await Tutor.create(tutorPayload);

  return res.status(201).json(
    successResponse(
      {
        userId: user._id,
        tutorId: tutor._id,
        emailCaptured: Boolean(realEmail),
        phoneCaptured: Boolean(normalizedPhone),
        meta: {
          experience,
        },
      },
      'Tutor application submitted successfully'
    )
  );
});

export default {
  createLandingParentLead,
  createLandingTutorApplication,
};
