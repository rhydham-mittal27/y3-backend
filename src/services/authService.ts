import User from '../models/User';
import Tutor from '../models/Tutor';
import FinalClass from '../models/FinalClass';
import ClassLead from '../models/ClassLead';
import Manager from '../models/Manager';
import mongoose from 'mongoose';
import ErrorResponse from '../utils/errorResponse';
import { verifyRefreshToken } from '../utils/jwtUtils';
import { USER_ROLES } from '../config/constants';
import { computeTutorMonthlyStats } from './finalClassService';
import { sendEmail, sendResendOtpEmail } from '../utils/emailService';
import { validatePassword } from '../utils/passwordValidator';
import { logError } from '../utils/logger';
import crypto from 'crypto';

const loginOtpStore = new Map<string, { otp: string; expiresAt: Date }>();
const changePasswordOtpStore = new Map<string, { otp: string; expiresAt: Date }>();
const registrationOtpStore = new Map<string, { otp: string; expiresAt: Date }>();
const verifiedEmailStore = new Set<string>(); // emails cleared after successful registration

const normalizeEmail = (email: string) => String(email || '').toLowerCase().trim();

const getEmailCandidates = (email: string): string[] => {
  const normalized = normalizeEmail(email);
  const candidates = new Set<string>([normalized]);

  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return Array.from(candidates);
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return Array.from(candidates);
  }

  const localWithoutPlus = localPart.split('+')[0];
  const localWithoutDots = localWithoutPlus.replace(/\./g, '');
  const domains = ['gmail.com', 'googlemail.com'];

  for (const d of domains) {
    candidates.add(`${localPart}@${d}`);
    candidates.add(`${localWithoutPlus}@${d}`);
    candidates.add(`${localWithoutDots}@${d}`);
  }

  return Array.from(candidates);
};

const findUserByEmailCandidates = async (email: string) => {
  const candidates = getEmailCandidates(email);
  return User.findOne({ email: { $in: candidates } });
};

const findLeadByEmailCandidates = async (email: string) => {
  const candidates = getEmailCandidates(email);
  return ClassLead.findOne({ parentEmail: { $in: candidates } });
};

const getStoredOtpEntry = (email: string) => {
  const candidates = getEmailCandidates(email);
  for (const candidate of candidates) {
    const entry = loginOtpStore.get(candidate);
    if (entry) {
      return { key: candidate, entry };
    }
  }

  return null;
};

const updateTutorMonthlyStatsSafe = async (userId: string) => {
  try {
    const stats = await computeTutorMonthlyStats(userId);
    await Tutor.updateOne({ user: new mongoose.Types.ObjectId(userId) }, { $set: { monthlyStats: stats } });
  } catch (e) {
    // do not block login on stats update failure
    logError(`Failed to update tutor monthlyStats: ${(e as Error).message}`);
  }
};

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  phone?: string,
  dob?: string | Date,
  city?: string,
  gender?: 'MALE' | 'FEMALE' | 'OTHER',
  role?: string
) => {
  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ErrorResponse('User already exists', 409);
  }

  if (role === 'TUTOR' && !isEmailVerifiedForRegistration(normalizedEmail)) {
    throw new ErrorResponse('Email must be verified before registering as a tutor', 400);
  }

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new ErrorResponse(
      `Password validation failed: ${passwordValidation.errors.join(', ')}`,
      400
    );
  }

  const user = new User({
    name,
    email: normalizedEmail,
    password,
    phone,
    dob: dob ? new Date(dob) : undefined,
    city,
    gender,
    role,
  });
  await user.save();

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save();

  if (user.role === USER_ROLES.TUTOR) {
    await updateTutorMonthlyStatsSafe((user as any).id as string);
    consumeVerifiedEmail(normalizedEmail);
  }

  let preferredMode: string | undefined;
  let isProfileComplete = true;
  let verificationStatus: string | undefined;

  if (user.role === USER_ROLES.TUTOR) {
    const tutor = await Tutor.findOne({ user: user._id });
    if (tutor) {
      preferredMode = tutor.preferredMode;
      verificationStatus = tutor.verificationStatus;
    }
  }

  if (user.role === USER_ROLES.MANAGER) {
    const manager = await Manager.findOne({ user: user._id });
    if (manager) {
      isProfileComplete = (manager as any).isProfileComplete;
      verificationStatus = (manager as any).verificationStatus;
    } else {
      isProfileComplete = false;
    }
  }

  if (user.role === USER_ROLES.COORDINATOR) {
    const CoordinatorModel = mongoose.model('Coordinator');
    const coordinator = await CoordinatorModel.findOne({ user: user._id });
    if (coordinator) {
      verificationStatus = (coordinator as any).verificationStatus;
    }
  }

  const safeUser = {
    id: (user as any).id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    userType: (user as any).userType ?? 'PARENT',
    phone: user.phone,
    dob: (user as any).dob,
    gender: (user as any).gender,
    city: (user as any).city,
    isActive: user.isActive,
    acceptedTerms: user.acceptedTerms,
    preferredMode: preferredMode || (user as any).preferredMode,
    isProfileComplete,
    verificationStatus,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, tokens: { accessToken, refreshToken } };
};

export const getParentEmailByClassName = async (className: string) => {
  const normalizedName = String(className).trim();
  const finalClass = await FinalClass.findOne({ className: normalizedName })
    .populate('parent', 'email role')
    .populate('classLead');

  if (!finalClass) {
    throw new ErrorResponse('Class not found', 404);
  }

  let resolvedEmail: string | null = null;

  // First preference: existing parent user linked to the class
  const parentUser = finalClass.parent as any;
  if (parentUser && parentUser.email && parentUser.role === USER_ROLES.PARENT) {
    resolvedEmail = normalizeEmail(parentUser.email);
  } else {
    // Fallback: use parentEmail from the associated class lead, if available
    const lead: any = finalClass.classLead;
    if (lead && lead.parentEmail) {
      resolvedEmail = normalizeEmail(lead.parentEmail);
    }
  }

  if (!resolvedEmail) {
    throw new ErrorResponse('Parent email not found for this class', 404);
  }

  // Best-effort: if a parent user already exists for this email and class has no parent, link them
  try {
    const existingUser = await User.findOne({ email: resolvedEmail });
    if (existingUser && !finalClass.parent) {
      finalClass.parent = existingUser._id;
      await finalClass.save();
    }
  } catch (e) {
    console.error('[getParentEmailByClassName] Failed to link parent user to class', e);
  }

  return { email: resolvedEmail };
};

export const loginUser = async (email: string, password: string) => {
  const normalizedEmail = normalizeEmail(email);
  console.log('[loginUser] Attempting login for email:', normalizedEmail);
  const user = await User.findOne({ email: { $in: getEmailCandidates(normalizedEmail) } }).select('+password +refreshToken');
  console.log('[loginUser] User lookup result:', user ? { id: (user as any).id, email: user.email, role: user.role } : null);
  if (!user) {
    // Check if a soft-deleted account exists for this email
    const deletedUser = await User.findOne({
      email: { $in: getEmailCandidates(normalizedEmail) },
      deletedAt: { $ne: null },
    }).select('+password');
    if (deletedUser) {
      const isMatch = await deletedUser.comparePassword(password);
      if (isMatch) throw new ErrorResponse('ACCOUNT_PENDING_DELETION', 403);
    }
    console.log('[loginUser] No user found for email, throwing Invalid credentials');
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

  let preferredMode: string | undefined;
  let isProfileComplete = true;
  let verificationStatus: string | undefined;
  let permissions: any = undefined;

  if (user.role === USER_ROLES.TUTOR) {
    const tutor = await Tutor.findOne({ user: user._id });
    if (tutor) {
      preferredMode = tutor.preferredMode;
      verificationStatus = tutor.verificationStatus;
    }
  }

  if (user.role === USER_ROLES.MANAGER) {
    const manager = await Manager.findOne({ user: user._id });
    if (manager) {
      isProfileComplete = (manager as any).isProfileComplete;
      verificationStatus = (manager as any).verificationStatus;
      permissions = {
        canViewSiteLeads: (manager as any).permissions?.canViewSiteLeads ?? false,
        canVerifyTutors: (manager as any).permissions?.canVerifyTutors ?? false,
        canCreateLeads: (manager as any).permissions?.canCreateLeads ?? false,
      };
    } else {
      isProfileComplete = false;
    }
  }

  if (user.role === USER_ROLES.COORDINATOR) {
    const CoordinatorModel = mongoose.model('Coordinator');
    const coordinator = await CoordinatorModel.findOne({ user: user._id });
    if (coordinator) {
      verificationStatus = (coordinator as any).verificationStatus;
    }
  }

  const safeUser = {
    id: (user as any).id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    userType: (user as any).userType ?? 'PARENT',
    phone: user.phone,
    dob: (user as any).dob,
    gender: (user as any).gender,
    city: (user as any).city,
    isActive: user.isActive,
    acceptedTerms: user.acceptedTerms,
    preferredMode: preferredMode || (user as any).preferredMode,
    isProfileComplete,
    verificationStatus,
    permissions,
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

  // Validate new password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new ErrorResponse(
      `Password validation failed: ${passwordValidation.errors.join(', ')}`,
      400
    );
  }

  // Check if new password is same as current
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ErrorResponse('New password must be different from current password', 400);
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ErrorResponse('Current password is incorrect', 400);
  }

  user.password = newPassword;
  await user.save();

  return { success: true, message: 'Password changed successfully' };
};

export const sendLoginOtp = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  let user = await findUserByEmailCandidates(normalizedEmail);

  // If no user exists yet, attempt to auto-create a PARENT user based on class leads
  if (!user) {
    const matchingLead = await findLeadByEmailCandidates(normalizedEmail);

    if (matchingLead) {
      const parentName = (matchingLead as any).parentName || `Parent of ${(matchingLead as any).studentName || 'Student'}`;
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = new User({
        name: parentName,
        email: normalizedEmail,
        role: USER_ROLES.PARENT,
        password: randomPassword,
      } as any);
      await user.save();

      // Link this new parent user to any final classes created from this lead which don't yet have a parent
      try {
        await FinalClass.updateMany(
          { classLead: (matchingLead as any)._id, parent: { $exists: false } },
          { $set: { parent: (user as any)._id } }
        );
      } catch (e) {
        // Non-fatal: failures here should not block OTP flow
        console.error('[sendLoginOtp] Failed to link parent user to FinalClass documents', e);
      }
    } else {
      throw new ErrorResponse('User not found', 404);
    }
  }

  const otpEmail = normalizeEmail(user.email);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  loginOtpStore.set(otpEmail, { otp, expiresAt });

  // Attempt to send OTP via email
  try {
    await sendEmail(
      otpEmail,
      'Your Login OTP - Your Shikshak',
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login OTP</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); margin-top: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #667eea; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #667eea; margin-bottom: 10px; }
          .otp-box { background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); padding: 30px; border-radius: 12px; margin: 30px 0; text-align: center; border: 2px dashed #667eea; }
          .otp-label { color: #666; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
          .otp-code { font-size: 42px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; margin: 15px 0; font-style: italic; }
          .timer { color: #e74c3c; font-size: 16px; font-weight: bold; margin-top: 15px; }
          .security-info { background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; color: #856404; font-size: 13px; }
          .notice { background-color: #f8d7da; padding: 12px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #f5c6cb; color: #721c24; font-size: 13px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px; }
          .footer a { color: #667eea; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Your Shikshak</div>
          </div>

          <h2 style="text-align: center; color: #333; margin-bottom: 25px;">One-Time Password (OTP)</h2>

          <p>Hello,</p>
          <p>We received a login request for your Your Shikshak account. Use the one-time password below to complete your login:</p>

          <div class="otp-box">
            <div class="otp-label">Your OTP Code</div>
            <div class="otp-code">${otp}</div>
            <div class="timer">⏱️ Expires in 10 minutes</div>
          </div>

          <div class="security-info">
            <strong>🔒 Important:</strong> Never share this code with anyone. Your Shikshak support team will never ask for your OTP.
          </div>

          <div class="notice">
            <strong>⚠️ Didn't request this login?</strong> If you didn't attempt to login, please ignore this email and secure your account immediately by changing your password.
          </div>

          <p style="text-align: center; margin-top: 30px; color: #666;">
            Questions? <a href="mailto:support@yourshikshak.in" style="color: #667eea; text-decoration: none; font-weight: bold;">Contact Support</a>
          </p>

          <div class="footer">
            <p style="margin: 0;">Best regards,<br><strong>Your Shikshak Security Team</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;"><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sendLoginOtp] Failed to send OTP email, see error below. OTP will still be logged for development.', e);
  }

  // Always log OTP in dev so it can be used for testing
  // eslint-disable-next-line no-console
  console.log(`[sendLoginOtp] OTP for ${otpEmail}:`, otp);

  return { success: true, expiresAt };
};

export const resendLoginOtp = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  let user = await findUserByEmailCandidates(normalizedEmail);

  // If no user exists yet, attempt to auto-create a PARENT user based on class leads
  if (!user) {
    const matchingLead = await findLeadByEmailCandidates(normalizedEmail);

    if (matchingLead) {
      const parentName = (matchingLead as any).parentName || `Parent of ${(matchingLead as any).studentName || 'Student'}`;
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = new User({
        name: parentName,
        email: normalizedEmail,
        role: USER_ROLES.PARENT,
        password: randomPassword,
      } as any);
      await user.save();

      // Link this new parent user to any final classes created from this lead which don't yet have a parent
      try {
        await FinalClass.updateMany(
          { classLead: (matchingLead as any)._id, parent: { $exists: false } },
          { $set: { parent: (user as any)._id } }
        );
      } catch (e) {
        // Non-fatal: failures here should not block OTP flow
        console.error('[resendLoginOtp] Failed to link parent user to FinalClass documents', e);
      }
    } else {
      throw new ErrorResponse('User not found', 404);
    }
  }

  const otpEmail = normalizeEmail(user.email);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  loginOtpStore.set(otpEmail, { otp, expiresAt });

  // Use sendResendOtpEmail for resend requests
  try {
    await sendResendOtpEmail(
      otpEmail,
      'Your login OTP for Your Shikshak (Resent)',
      `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
         <h2 style="color: #2563eb;">Resent: Your Login OTP</h2>
         <p>You requested to resend your one-time password (OTP):</p>
         <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
           <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${otp}</span>
         </div>
         <p>This code will expire in 10 minutes.</p>
         <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
       </div>`
    );
  } catch (e) {
    console.error('[resendLoginOtp] Failed to send OTP email, see error below. OTP will still be logged for development.', e);
  }

  // Always log OTP in dev so it can be used for testing
  console.log(`[resendLoginOtp] OTP for ${otpEmail}:`, otp);

  return { success: true, expiresAt };
};

export const verifyLoginOtp = async (email: string, otp: string) => {
  const normalizedEmail = normalizeEmail(email);
  const otpRecord = getStoredOtpEntry(normalizedEmail);
  const entry = otpRecord?.entry;

  if (!entry || entry.otp !== otp || entry.expiresAt.getTime() < Date.now()) {
    throw new ErrorResponse('Invalid or expired OTP', 400);
  }

  // OTP is one-time use
  loginOtpStore.delete(otpRecord!.key);

  const user = await User.findOne({ email: { $in: getEmailCandidates(normalizedEmail) } }).select('+refreshToken');
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save();

  let preferredMode: string | undefined;
  let isProfileComplete = true;
  let verificationStatus: string | undefined;
  let permissions: any = undefined;

  if (user.role === USER_ROLES.TUTOR) {
    const tutor = await Tutor.findOne({ user: user._id });
    if (tutor) {
      preferredMode = tutor.preferredMode;
      verificationStatus = tutor.verificationStatus;
    }
  }

  if (user.role === USER_ROLES.MANAGER) {
    const manager = await Manager.findOne({ user: user._id });
    if (manager) {
      isProfileComplete = (manager as any).isProfileComplete;
      verificationStatus = (manager as any).verificationStatus;
      permissions = {
        canViewSiteLeads: (manager as any).permissions?.canViewSiteLeads ?? false,
        canVerifyTutors: (manager as any).permissions?.canVerifyTutors ?? false,
        canCreateLeads: (manager as any).permissions?.canCreateLeads ?? false,
      };
    } else {
      isProfileComplete = false;
    }
  }

  if (user.role === USER_ROLES.COORDINATOR) {
    const CoordinatorModel = mongoose.model('Coordinator');
    const coordinator = await CoordinatorModel.findOne({ user: user._id });
    if (coordinator) {
      verificationStatus = (coordinator as any).verificationStatus;
    }
  }

  const safeUser = {
    id: (user as any).id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    userType: (user as any).userType ?? 'PARENT',
    phone: user.phone,
    dob: (user as any).dob,
    isActive: user.isActive,
    acceptedTerms: user.acceptedTerms,
    preferredMode,
    isProfileComplete,
    verificationStatus,
    permissions,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, tokens: { accessToken, refreshToken } };
};

// ... (rest of the code remains the same)
export const acceptTerms = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  user.acceptedTerms = true;
  (user as any).acceptedPolicies = true;
  (user as any).acceptedAt = new Date();
  (user as any).policyVersion = '2026-02-25';
  (user as any).accepted_policies = true;
  (user as any).accepted_at = new Date();
  (user as any).policy_version = '2026-02-25';
  await user.save();

  return user;
};

export const sendChangePasswordOtp = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  changePasswordOtpStore.set(user.id, { otp, expiresAt });

  try {
    await sendEmail(
      user.email,
      'Change Password OTP - Your Shikshak',
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Change Verification</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); margin-top: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .alert-banner { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; }
          .otp-box { background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%); padding: 30px; border-radius: 12px; margin: 25px 0; text-align: center; border: 2px solid #2563eb; }
          .otp-label { color: #1f2937; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; margin-bottom: 12px; }
          .otp-code { font-size: 44px; font-weight: bold; color: #2563eb; letter-spacing: 10px; font-family: 'Courier New', monospace; margin: 15px 0; }
          .timer { color: #dc2626; font-size: 14px; font-weight: bold; margin-top: 12px; }
          .steps { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e; }
          .steps h3 { color: #166534; margin-top: 0; }
          .steps ol { margin: 10px 0; padding-left: 20px; color: #4b5563; }
          .steps li { margin: 8px 0; }
          .security-info { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; color: #92400e; font-size: 13px; }
          .danger-notice { background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ef4444; color: #7f1d1d; font-size: 13px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px; }
          .footer a { color: #2563eb; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🔐 Your Shikshak</div>
          </div>

          <div class="alert-banner">Password Change Verification Required</div>

          <h2 style="color: #333; text-align: center;">Change Your Password</h2>

          <p>We received a request to change the password for your Your Shikshak account. Use the verification code below to proceed:</p>

          <div class="otp-box">
            <div class="otp-label">Verification Code</div>
            <div class="otp-code">${otp}</div>
            <div class="timer">⏳ Valid for 10 minutes</div>
          </div>

          <div class="steps">
            <h3>📋 Next Steps:</h3>
            <ol>
              <li>Go to the password change page</li>
              <li>Enter the verification code above</li>
              <li>Create a new strong password</li>
              <li>Confirm your new password</li>
            </ol>
          </div>

          <div class="security-info">
            <strong>💡 Password Tips:</strong> Use a combination of uppercase, lowercase, numbers, and special characters for maximum security.
          </div>

          <div class="danger-notice">
            <strong>⚠️ Important:</strong> If you didn't request this password change, please ignore this email and immediately contact our support team to secure your account.
          </div>

          <p style="text-align: center; margin-top: 30px; color: #666;">
            Need help? <a href="mailto:support@yourshikshak.in" style="color: #2563eb; text-decoration: none; font-weight: bold;">Contact Support</a>
          </p>

          <div class="footer">
            <p style="margin: 0;">Best regards,<br><strong>Your Shikshak Security Team</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;"><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>`
    );
  } catch (e) {
    console.error('[sendChangePasswordOtp] Failed to send email', e);
  }

  console.log(`[sendChangePasswordOtp] OTP for ${user.email} (${user.id}):`, otp);
  return { success: true, message: 'OTP sent to your registered email' };
};

export const resendChangePasswordOtp = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  changePasswordOtpStore.set(user.id, { otp, expiresAt });

  try {
    await sendResendOtpEmail(
      user.email,
      'Change Password OTP - Your Shikshak (Resent)',
      `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
         <h2 style="color: #2563eb;">Resent: Password Change Verification</h2>
         <p>You requested to resend your password change verification code:</p>
         <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
           <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${otp}</span>
         </div>
         <p>This code will expire in 10 minutes.</p>
         <p style="color: #6b7280; font-size: 14px;">If you didn't request this change, please ignore this email or contact support.</p>
       </div>`
    );
  } catch (e) {
    console.error('[resendChangePasswordOtp] Failed to send email', e);
  }

  console.log(`[resendChangePasswordOtp] OTP for ${user.email} (${user.id}):`, otp);
  return { success: true, message: 'OTP resent to your registered email' };
};


export const verifyChangePasswordWithOtp = async (userId: string, otp: string, newPassword: string) => {
  const entry = changePasswordOtpStore.get(userId);

  if (!entry || entry.otp !== otp || entry.expiresAt.getTime() < Date.now()) {
    throw new ErrorResponse('Invalid or expired OTP', 400);
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new ErrorResponse('User not found', 404);
  }

  // Validate new password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new ErrorResponse(
      `Password validation failed: ${passwordValidation.errors.join(', ')}`,
      400
    );
  }

  // Check if new password is same as curren (if possible to check without current pass, we can skip or check hash)
  // We can check against the hash
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ErrorResponse('New password must be different from current password', 400);
  }

  user.password = newPassword;
  await user.save();

  // Clear OTP
  changePasswordOtpStore.delete(userId);

  return { success: true, message: 'Password changed successfully' };
};

export const sendRegistrationOtp = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  registrationOtpStore.set(normalizedEmail, { otp, expiresAt });

  try {
    await sendEmail(
      normalizedEmail,
      'Verify Your Email - YourShikshak',
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
        .container{max-width:500px;margin:40px auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
        .otp{font-size:40px;font-weight:bold;color:#0052FF;letter-spacing:10px;text-align:center;margin:24px 0;font-family:monospace}
        .footer{color:#999;font-size:12px;margin-top:24px;text-align:center}
      </style></head><body>
        <div class="container">
          <h2 style="color:#0A1628;text-align:center">Verify Your Email</h2>
          <p style="color:#555;text-align:center">Use the code below to verify your email address for YourShikshak tutor registration.</p>
          <div class="otp">${otp}</div>
          <p style="color:#888;text-align:center;font-size:13px">This code expires in <strong>10 minutes</strong>.</p>
          <div class="footer">If you didn't request this, ignore this email.</div>
        </div>
      </body></html>`
    );
  } catch (e) {
    console.error('[sendRegistrationOtp] Failed to send email:', e);
  }
  console.log(`[sendRegistrationOtp] OTP for ${normalizedEmail}:`, otp);
};

export const verifyRegistrationOtp = (email: string, otp: string) => {
  const normalizedEmail = normalizeEmail(email);
  const entry = registrationOtpStore.get(normalizedEmail);
  if (!entry) throw new ErrorResponse('No OTP found for this email. Please request a new one.', 400);
  if (new Date() > entry.expiresAt) {
    registrationOtpStore.delete(normalizedEmail);
    throw new ErrorResponse('OTP has expired. Please request a new one.', 400);
  }
  if (entry.otp !== otp.trim()) throw new ErrorResponse('Invalid OTP. Please try again.', 400);
  registrationOtpStore.delete(normalizedEmail);
  verifiedEmailStore.add(normalizedEmail);
};

export const isEmailVerifiedForRegistration = (email: string) =>
  verifiedEmailStore.has(normalizeEmail(email));

export const consumeVerifiedEmail = (email: string) =>
  verifiedEmailStore.delete(normalizeEmail(email));

export const restoreAndLoginUser = async (email: string, password: string) => {
  const normalizedEmail = normalizeEmail(email);

  const user = await User.findOne({
    email: { $in: getEmailCandidates(normalizedEmail) },
    deletedAt: { $ne: null },
  }).select('+password +refreshToken');

  if (!user) throw new ErrorResponse('No account pending deletion found for this email', 404);

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ErrorResponse('Invalid credentials', 401);

  // Restore user
  await (user as any).restore();

  // Restore associated Tutor profile if it was soft-deleted
  const tutor = await Tutor.findOne({ user: user._id, deletedAt: { $ne: null } });
  if (tutor) await (tutor as any).restore();

  // Complete login via the standard flow now that the user is active again
  return loginUser(email, password);
};

export const forgotPassword = async (email: string) => {
  const user = await findUserByEmailCandidates(email);
  if (!user) {
    // Don't reveal whether the email exists
    return;
  }

  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await User.findByIdAndUpdate(user._id, {
    passwordResetToken: hashedToken,
    passwordResetExpires: expiresAt,
  });

  const redirectUrl = `https://api.yourshikshak.in/api/auth/reset-password-redirect?token=${encodeURIComponent(plainToken)}`;

  await sendEmail(
    user.email,
    'YourShikshak — Reset Your Password',
    `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; padding: 20px; }
        .container { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .logo { font-size: 22px; font-weight: 800; color: #1d4ed8; margin-bottom: 24px; }
        h2 { color: #0f172a; font-size: 22px; margin: 0 0 12px; }
        p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
        .btn { display: block; background: linear-gradient(135deg, #1d4ed8, #3b82f6); color: #fff !important; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 700; margin: 28px 0; }
        .note { font-size: 13px; color: #94a3b8; }
        .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">✓ YourShikshak</div>
        <h2>Reset Your Password</h2>
        <p>Hi ${user.name},</p>
        <p>Tap the button below to open the YourShikshak app and reset your password instantly.</p>
        <a href="${redirectUrl}" class="btn">Reset My Password</a>
        <p class="note">⏱ This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.</p>
        <div class="footer">YourShikshak · Empowering Education</div>
      </div>
    </body>
    </html>`,
  );
};

export const resetPassword = async (token: string, newPassword: string) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password');

  if (!user) throw new ErrorResponse('Invalid or expired reset token', 400);

  if (newPassword.length < 6) throw new ErrorResponse('Password must be at least 6 characters', 400);

  user.password = newPassword;
  (user as any).passwordResetToken = null;
  (user as any).passwordResetExpires = null;
  await user.save();
};
