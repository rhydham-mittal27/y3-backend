import express from 'express';
import { loginStudent, changePassword, getStudentProfile } from '../controllers/studentAuthController';

const router = express.Router();

// Student login
router.post('/login', loginStudent);

// Change password
router.post('/change-password', changePassword);

// Get student profile
router.get('/profile/:studentId', getStudentProfile);

export default router;
