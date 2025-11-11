import { Router } from 'express';
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllNotificationsAsRead,
  deleteNotificationController,
} from '../controllers/notificationController';
import { notificationIdValidation } from '../validators/notificationValidator';
import protect from '../middlewares/auth';

const router = Router();

router.use(protect);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadNotificationCount);
router.patch('/mark-all-read', markAllNotificationsAsRead);
router.patch('/:id/read', notificationIdValidation, markAsRead);
router.delete('/:id', notificationIdValidation, deleteNotificationController);

export default router;
