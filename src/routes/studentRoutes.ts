import { Router } from 'express';
import { 
  getDashboardStats, 
  getMyClasses, 
  getMyAnnouncements,
  getStudentDashboardStats,
  getStudentClasses,
  getStudentAttendance,
  getStudentTests,
  getStudentNotes,
  getStudentPayments,
  getStudentProfile
} from '../controllers/studentController';
import protect from '../middlewares/auth';
import protectStudent from '../middlewares/studentAuth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

// Parent routes (existing) - use regular auth
router.get('/dashboard/stats', protect, authorize(USER_ROLES.PARENT), getDashboardStats);
router.get('/my-classes', protect, authorize(USER_ROLES.PARENT), getMyClasses);
router.get('/announcements', protect, authorize(USER_ROLES.PARENT), getMyAnnouncements);

// Student routes (new) - use student-specific auth
router.get('/student/dashboard/stats', protectStudent, authorize(USER_ROLES.STUDENT), getStudentDashboardStats);
router.get('/student/classes', protectStudent, authorize(USER_ROLES.STUDENT), getStudentClasses);
router.get('/student/attendance', protectStudent, authorize(USER_ROLES.STUDENT), getStudentAttendance);
router.get('/student/tests', protectStudent, authorize(USER_ROLES.STUDENT), getStudentTests);
router.get('/student/notes', protectStudent, authorize(USER_ROLES.STUDENT), getStudentNotes);
router.get('/student/payments', protectStudent, authorize(USER_ROLES.STUDENT), getStudentPayments);
router.get('/:id', protect, authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), getStudentProfile);

export default router;

