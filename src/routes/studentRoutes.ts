import { Router } from 'express';
import { getDashboardStats, getMyClasses, getMyAnnouncements } from '../controllers/studentController';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.get('/dashboard/stats', authorize(USER_ROLES.PARENT), getDashboardStats);

router.get('/my-classes', authorize(USER_ROLES.PARENT), getMyClasses);

router.get('/announcements', authorize(USER_ROLES.PARENT), getMyAnnouncements);

export default router;

