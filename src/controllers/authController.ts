import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { registerUser, loginUser, refreshAccessToken, logoutUser, changePassword, sendLoginOtp, resendLoginOtp, verifyLoginOtp, getParentEmailByClassName, acceptTerms, sendChangePasswordOtp, resendChangePasswordOtp, verifyChangePasswordWithOtp, restoreAndLoginUser, sendRegistrationOtp, verifyRegistrationOtp, forgotPassword, resetPassword } from '../services/authService';
import { createManagerProfile } from '../services/managerService';
import { createCoordinator } from '../services/coordinatorService';
import { USER_ROLES } from '../config/constants';
import { AuthRequest } from '../types';
import { sendEmail } from '../utils/emailService';
import User from '../models/User';
import Tutor from '../models/Tutor';

export const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { name, email, password, phone, dob, city, gender, role, permissions } = req.body;
  const result = await registerUser(name, email, password, phone, dob, city, gender, role);

  // Automatically create profiles for staff roles where possible
  try {
    const userId = (result as any)?.user?.id as string | undefined;

    if (userId && role === USER_ROLES.MANAGER) {
      await createManagerProfile(userId, permissions);
    } else if (userId && role === USER_ROLES.COORDINATOR) {
      await createCoordinator(userId);
    }
  } catch (e) {
    // If profile creation fails for some reason, surface a clear error
    throw new ErrorResponse((e as any)?.message || 'Failed to create staff profile', 400);
  }

  // Send confirmation email
  try {
    await sendEmail(
      email,
      'Welcome to Your Shikshak - Account Created',
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Your Shikshak</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); margin-top: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #667eea; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #667eea; margin-bottom: 10px; }
          .tagline { color: #666; font-size: 14px; }
          h1 { color: #333; margin: 20px 0; text-align: center; font-size: 24px; }
          .welcome-box { background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 5px solid #667eea; }
          .role-badge { display: inline-block; background: #667eea; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin: 10px 0; }
          .credentials { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
          .credential-item { margin: 12px 0; display: flex; justify-content: space-between; align-items: center; padding: 10px; background: white; border-radius: 5px; }
          .label { font-weight: bold; color: #666; font-size: 14px; }
          .value { font-weight: bold; color: #667eea; font-size: 16px; font-family: 'Courier New', monospace; }
          .features { margin: 30px 0; }
          .feature-item { display: flex; align-items: flex-start; margin: 15px 0; }
          .feature-icon { width: 40px; height: 40px; background: #667eea; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold; flex-shrink: 0; }
          .feature-text { flex: 1; }
          .feature-text h3 { margin: 0 0 5px 0; color: #333; font-size: 16px; }
          .feature-text p { margin: 0; color: #666; font-size: 14px; }
          .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; border-radius: 25px; text-decoration: none; font-weight: bold; margin: 20px 0; text-align: center; width: 100%; box-sizing: border-box; }
          .cta-button:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
          .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px; }
          .footer-links { margin: 10px 0; }
          .footer-links a { color: #667eea; text-decoration: none; margin: 0 10px; }
          .highlight { background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">✓ Your Shikshak</div>
            <div class="tagline">Empowering Education</div>
          </div>

          <h1>Welcome to Your Shikshak! 🎉</h1>

          <p>Hello <strong>${name}</strong>,</p>

          <div class="welcome-box">
            <p style="margin-top: 0; font-size: 16px;">Your account has been successfully created! We're excited to have you join our learning community.</p>
            <p style="text-align: center; margin-bottom: 0;">
              <span class="role-badge">${role.toUpperCase()}</span>
            </p>
          </div>

          <div class="credentials">
            <div class="credential-item">
              <span class="label">📧 Login Email:</span>
              <span class="value">${email}</span>
            </div>
          </div>

          <div class="highlight">
            <strong>🔐 Security Tip:</strong> Never share your login credentials with anyone. Your password is case-sensitive and unique to your account.
          </div>

          <div class="features">
            <h2 style="color: #333; margin-bottom: 20px; font-size: 18px;">What You Can Do:</h2>
            <div class="feature-item">
              <div class="feature-icon">📊</div>
              <div class="feature-text">
                <h3>Manage Your Dashboard</h3>
                <p>Access your personalized dashboard to track activities and progress</p>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon">📚</div>
              <div class="feature-text">
                <h3>Access Resources</h3>
                <p>Explore educational materials, notes, and resources curated for your growth</p>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon">🔔</div>
              <div class="feature-text">
                <h3>Stay Updated</h3>
                <p>Receive important notifications and updates directly in your dashboard</p>
              </div>
            </div>
          </div>

          <a href="https://yourshikshak.in" class="cta-button" style="display: block; padding: 14px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 30px 0;">Go to Your Dashboard</a>

          <p style="text-align: center; color: #666;">If you didn't create this account or have any questions, please contact our support team immediately.</p>

          <div class="footer">
            <p style="margin: 0 0 10px 0;">Best regards,<br><strong>Team Your Shikshak</strong></p>
            <div class="footer-links">
              <a href="mailto:support@yourshikshak.in">Support</a> | 
              <a href="https://yourshikshak.in/help">Help Center</a> | 
              <a href="https://yourshikshak.in/privacy">Privacy Policy</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: #999;"><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>`
    );
  } catch (emailError) {
    console.error('[RegistrationEmail] Failed to send confirmation email:', emailError);
    // Non-blocking: we still return success for registration even if email fails
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

export const resendLoginOtpHandler = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  const { email } = req.body as { email: string };
  const result = await resendLoginOtp(email);
  return res.status(200).json(successResponse(result, 'OTP resent successfully'));
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

export const acceptTermsHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  const result = await acceptTerms(req.user.id);
  return res.status(200).json(successResponse(result, 'Terms accepted successfully'));
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

export const sendChangePasswordOtpHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  const result = await sendChangePasswordOtp(req.user.id);
  return res.status(200).json(successResponse(result, 'OTP sent successfully'));
});

export const resendChangePasswordOtpHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }
  const result = await resendChangePasswordOtp(req.user.id);
  return res.status(200).json(successResponse(result, 'OTP resent successfully'));
});

export const verifyChangePasswordOtpHandler = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0]?.msg || 'Validation error', 400);
  }

  if (!req.user) {
    throw new ErrorResponse('Not authenticated', 401);
  }

  const { otp, newPassword } = req.body as { otp: string; newPassword: string };
  const result = await verifyChangePasswordWithOtp(req.user.id, otp, newPassword);
  return res.status(200).json(successResponse(result, 'Password changed successfully'));
});

export const savePushTokenHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) throw new ErrorResponse('Not authenticated', 401);
  const { expoPushToken } = req.body as { expoPushToken?: string };
  if (!expoPushToken) throw new ErrorResponse('expoPushToken is required', 400);
  await User.findByIdAndUpdate(req.user.id, { expoPushToken });
  return res.status(200).json(successResponse(null, 'Push token saved'));
});

export const debugPushTokenHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) throw new ErrorResponse('Not authenticated', 401);
  const user = await User.findById(req.user.id).select('name role expoPushToken').lean();
  return res.status(200).json(successResponse({ name: (user as any)?.name, role: (user as any)?.role, expoPushToken: (user as any)?.expoPushToken ?? null }));
});

export const restoreAccountHandler = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) throw new ErrorResponse('email and password are required', 400);
  const result = await restoreAndLoginUser(email, password);
  return res.status(200).json(successResponse(result, 'Account restored successfully'));
});

export const deleteAccountHandler = asyncHandler(async (req: AuthRequest, res) => {
  if (!req.user) throw new ErrorResponse('Not authenticated', 401);

  const user = await User.findById(req.user.id);
  if (!user) throw new ErrorResponse('User not found', 404);

  // Soft-delete associated Tutor profile if exists
  const tutor = await Tutor.findOne({ user: req.user.id });
  if (tutor) await (tutor as any).softDelete();

  // Invalidate refresh token so all sessions are immediately revoked
  (user as any).refreshToken = null;
  await (user as any).softDelete();

  return res.status(200).json(successResponse(null, 'Your account has been scheduled for deletion. All data will be permanently removed after 30 days.'));
});

export const sendRegistrationOtpHandler = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ErrorResponse('Email is required', 400);
  await sendRegistrationOtp(email);
  return res.status(200).json(successResponse(null, 'OTP sent to your email'));
});

export const verifyRegistrationOtpHandler = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) throw new ErrorResponse('Email and OTP are required', 400);
  verifyRegistrationOtp(email, otp);
  return res.status(200).json(successResponse(null, 'Email verified successfully'));
});

export const forgotPasswordHandler = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ErrorResponse('Email is required', 400);
  await forgotPassword(email);
  return res.status(200).json(successResponse(null, 'If that email is registered, a reset token has been sent.'));
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw new ErrorResponse('Token and new password are required', 400);
  await resetPassword(token, newPassword);
  return res.status(200).json(successResponse(null, 'Password reset successfully. You can now sign in.'));
});
