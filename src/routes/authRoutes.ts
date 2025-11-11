import { Router } from 'express';
import { register, login, refreshToken, logout, getMe } from '../controllers/authController';
import { registerValidation, loginValidation, refreshTokenValidation } from '../validators/authValidator';
import protect from '../middlewares/auth';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshTokenValidation, refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
