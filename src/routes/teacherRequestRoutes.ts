import { Router } from 'express';
import { body } from 'express-validator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import {
  createTeacherRequestController,
  getMyTeacherRequestsController,
  getTeacherRequestByIdController,
  getAllTeacherRequestsController,
  updateTeacherRequestStatusController,
} from '../controllers/teacherRequestController';

const router = Router();

const parentOnly  = [protect, authorize(USER_ROLES.PARENT)];
const managerOnly = [protect, authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN)];

// ── Parent endpoints ──────────────────────────────────────────────────────────

// POST /api/v1/teacher-requests — submit new request
router.post(
  '/',
  ...parentOnly,
  [
    body('studentName').notEmpty().withMessage('Student name is required').trim(),
    body('board').notEmpty().withMessage('Board is required').isMongoId().withMessage('Invalid board ID'),
    body('grade').notEmpty().withMessage('Grade is required').isMongoId().withMessage('Invalid grade ID'),
    body('subjects')
      .isArray({ min: 1 })
      .withMessage('At least one subject is required'),
    body('subjects.*').isMongoId().withMessage('Each subject must be a valid ID'),
    body('mode')
      .notEmpty()
      .withMessage('Mode is required')
      .isIn(['ONLINE', 'OFFLINE', 'HYBRID'])
      .withMessage('Mode must be ONLINE, OFFLINE, or HYBRID'),
    body('preferredDays').optional().isArray(),
    body('preferredTimeSlot').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('budgetRange').optional().trim(),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  createTeacherRequestController,
);

// GET /api/v1/teacher-requests/my — my requests
router.get('/my', ...parentOnly, getMyTeacherRequestsController);

// ── Manager/Admin endpoints ───────────────────────────────────────────────────

// GET /api/v1/teacher-requests — list all
router.get('/', ...managerOnly, getAllTeacherRequestsController);

// GET /api/v1/teacher-requests/:id — single request (manager or owning parent)
router.get('/:id', protect, getTeacherRequestByIdController);

// PATCH /api/v1/teacher-requests/:id/status — update status
router.patch(
  '/:id/status',
  ...managerOnly,
  [
    body('status')
      .notEmpty()
      .isIn(['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'CONVERTED', 'CLOSED'])
      .withMessage('Invalid status'),
    body('notes').optional().trim(),
  ],
  updateTeacherRequestStatusController,
);

export default router;
