import { Router } from 'express';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import { body, param } from 'express-validator';
import {
  getMyTutorSessionsForCycleController,
  generateSessionsForClassCycleController,
  getMyCoordinatorSessionsForCycleController,
  getClassSessionsController,
  rescheduleSessionController,
  requestSessionRescheduleController,
} from '../controllers/classSessionController';

const router = Router();

router.use(protect);

router.get('/tutor/my', authorize(USER_ROLES.TUTOR), getMyTutorSessionsForCycleController);
router.get('/coordinator/my', authorize(USER_ROLES.COORDINATOR), getMyCoordinatorSessionsForCycleController);

router.post(
  '/class/:classId/generate',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  param('classId').isMongoId().withMessage('Invalid class ID'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Invalid month'),
  body('year').isInt({ min: 2000 }).withMessage('Invalid year'),
  generateSessionsForClassCycleController
);

router.get(
  '/class/:classId',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  param('classId').isMongoId().withMessage('Invalid class ID'),
  getClassSessionsController
);

router.patch(
  '/:sessionId/reschedule',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('newDate').isISO8601().withMessage('newDate must be a valid ISO date'),
  body('newTimeSlot').optional().isString().withMessage('newTimeSlot must be a string'),
  rescheduleSessionController
);

router.post(
  '/:sessionId/reschedule-request',
  authorize(USER_ROLES.TUTOR),
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('newDate').isISO8601().withMessage('newDate must be a valid ISO date'),
  requestSessionRescheduleController
);

export default router;
