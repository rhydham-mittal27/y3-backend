import User from '../models/User';
import Tutor from '../models/Tutor';
import FinalClass from '../models/FinalClass';
import ClassLead from '../models/ClassLead';
import ErrorResponse from '../utils/errorResponse';
import { verifyRefreshToken } from '../utils/jwtUtils';
import { USER_ROLES } from '../config/constants';
import { computeTutorMonthlyStats } from './finalClassService';
import { sendEmail } from '../utils/emailService';
import { validatePassword } from '../utils/passwordValidator';
import { logError } from '../utils/logger';
import crypto from 'crypto';

const loginOtpStore = new Map<string, { otp: string; expiresAt: Date }>();

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

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new ErrorResponse(
      `Password validation failed: ${passwordValidation.errors.join(', ')}`,
      400
    );
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
      logError(`Failed to update tutor monthlyStats: ${(e as Error).message}`);
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
    resolvedEmail = String(parentUser.email).toLowerCase().trim();
  } else {
    // Fallback: use parentEmail from the associated class lead, if available
    const lead: any = finalClass.classLead;
    if (lead && lead.parentEmail) {
      resolvedEmail = String(lead.parentEmail).toLowerCase().trim();
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
  console.log('[loginUser] Attempting login for email:', email);
  const user = await User.findOne({ email }).select('+password +refreshToken');
  console.log('[loginUser] User lookup result:', user ? { id: (user as any).id, email: user.email, role: user.role } : null);
  if (!user) {
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
  const normalizedEmail = String(email).toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });

  // If no user exists yet, attempt to auto-create a PARENT user based on class leads
  if (!user) {
    const matchingLead = await ClassLead.findOne({ parentEmail: normalizedEmail });

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

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  loginOtpStore.set(normalizedEmail, { otp, expiresAt });

  // Attempt to send OTP via email
  try {
    await sendEmail(
      normalizedEmail,
      'Your login OTP for Your Shikshak',
      `<p>Your one-time password (OTP) is:</p><h2>${otp}</h2><p>This code will expire in 10 minutes.</p>`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sendLoginOtp] Failed to send OTP email, see error below. OTP will still be logged for development.', e);
  }

  // Always log OTP in dev so it can be used for testing
  // eslint-disable-next-line no-console
  console.log(`[sendLoginOtp] OTP for ${normalizedEmail}:`, otp);

  return { success: true, expiresAt };
};

export const verifyLoginOtp = async (email: string, otp: string) => {
  const normalizedEmail = String(email).toLowerCase().trim();
  const entry = loginOtpStore.get(normalizedEmail);

  if (!entry || entry.otp !== otp || entry.expiresAt.getTime() < Date.now()) {
    throw new ErrorResponse('Invalid or expired OTP', 400);
  }

  // OTP is one-time use
  loginOtpStore.delete(normalizedEmail);

  const user = await User.findOne({ email: normalizedEmail }).select('+refreshToken');
  if (!user) {
    throw new ErrorResponse('User not found', 404);
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
