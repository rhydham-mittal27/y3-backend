import { Router } from 'express';
import { body } from 'express-validator';
import {
  registerParent,
  getMyParentProfile,
  getParentDashboard,
  submitTutorRequest,
  raiseParentConcernController,
  getParentSessions,
  verifyAttendance,
  requestReschedule,
  getParentPayments,
} from '../controllers/parentLeadController';
import { registerParentValidation } from '../validators/parentValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────
// POST /api/v1/parents/register
router.post('/register', registerParentValidation, registerParent);

// ── Protected (PARENT only) ──────────────────────────────────────────────────
const parentOnly = [protect, authorize(USER_ROLES.PARENT)];

// GET  /api/v1/parents/me
router.get('/me', ...parentOnly, getMyParentProfile);

// GET  /api/v1/parents/dashboard
router.get('/dashboard', ...parentOnly, getParentDashboard);

// POST /api/v1/parents/tutor-request
router.post(
  '/tutor-request',
  ...parentOnly,
  [
    body('subject').notEmpty().withMessage('Subject is required').trim(),
    body('grade').notEmpty().withMessage('Grade is required').trim(),
    body('board').optional().trim(),
    body('mode').optional().isIn(['ONLINE', 'OFFLINE', 'HYBRID']).withMessage('Invalid mode'),
    body('city').optional().trim(),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  submitTutorRequest,
);

// POST /api/v1/parents/concern
router.post(
  '/concern',
  ...parentOnly,
  [
    body('finalClassId').notEmpty().withMessage('finalClassId is required').isMongoId(),
    body('message').notEmpty().withMessage('Message is required').trim().isLength({ max: 1000 }),
  ],
  raiseParentConcernController,
);

// GET /api/v1/parents/sessions?month=YYYY-MM
router.get('/sessions', ...parentOnly, getParentSessions);

// POST /api/v1/parents/attendance/verify
router.post(
  '/attendance/verify',
  ...parentOnly,
  [
    body('attendanceId').notEmpty().isMongoId().withMessage('Valid attendanceId required'),
    body('verified').optional().isBoolean(),
  ],
  verifyAttendance,
);

// POST /api/v1/parents/reschedule
router.post(
  '/reschedule',
  ...parentOnly,
  [
    body('sessionId').notEmpty().isMongoId().withMessage('Valid sessionId required'),
    body('requestedDate').notEmpty().isISO8601().withMessage('Valid requestedDate (ISO) required'),
    body('requestedTime').notEmpty().trim().withMessage('requestedTime is required'),
    body('reason').optional().trim().isLength({ max: 500 }),
  ],
  requestReschedule,
);

// GET /api/v1/parents/payments
router.get('/payments', ...parentOnly, getParentPayments);

export default router;
