import { Router } from 'express';
import { register, login, refreshToken, logout, getMe, changePasswordHandler, sendLoginOtpHandler, resendLoginOtpHandler, verifyLoginOtpHandler, parentLoginLookupHandler, acceptTermsHandler, sendChangePasswordOtpHandler, resendChangePasswordOtpHandler, verifyChangePasswordOtpHandler, savePushTokenHandler, deleteAccountHandler } from '../controllers/authController';
import { registerValidation, loginValidation, refreshTokenValidation, sendLoginOtpValidation, verifyLoginOtpValidation, parentLoginLookupValidation, verifyChangePasswordOtpValidation } from '../validators/authValidator';
import { changePasswordValidation } from '../validators/settingsValidator';
import protect from '../middlewares/auth';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/login-otp/send', sendLoginOtpValidation, sendLoginOtpHandler);
router.post('/login-otp/resend', sendLoginOtpValidation, resendLoginOtpHandler);
router.post('/login-otp/verify', verifyLoginOtpValidation, verifyLoginOtpHandler);
router.post('/parent-login-lookup', parentLoginLookupValidation, parentLoginLookupHandler);
router.post('/refresh-token', refreshTokenValidation, refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
// Regular Change Password (with current password)
router.post('/change-password', protect, changePasswordValidation, changePasswordHandler);

// Change Password with OTP
router.post('/change-password-otp/send', protect, sendChangePasswordOtpHandler);
router.post('/change-password-otp/resend', protect, resendChangePasswordOtpHandler);
router.post('/change-password-otp/verify', protect, verifyChangePasswordOtpValidation, verifyChangePasswordOtpHandler);

router.post('/accept-terms', protect, acceptTermsHandler);
router.post('/push-token', protect, savePushTokenHandler);
router.delete('/account', protect, deleteAccountHandler);

export default router;
