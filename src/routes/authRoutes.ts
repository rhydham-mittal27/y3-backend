import { Router } from 'express';
import { register, login, refreshToken, logout, getMe, changePasswordHandler, sendLoginOtpHandler, verifyLoginOtpHandler, parentLoginLookupHandler } from '../controllers/authController';
import { registerValidation, loginValidation, refreshTokenValidation, sendLoginOtpValidation, verifyLoginOtpValidation, parentLoginLookupValidation } from '../validators/authValidator';
import { changePasswordValidation } from '../validators/settingsValidator';
import protect from '../middlewares/auth';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/login-otp/send', sendLoginOtpValidation, sendLoginOtpHandler);
router.post('/login-otp/verify', verifyLoginOtpValidation, verifyLoginOtpHandler);
router.post('/parent-login-lookup', parentLoginLookupValidation, parentLoginLookupHandler);
router.post('/refresh-token', refreshTokenValidation, refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePasswordValidation, changePasswordHandler);

export default router;
