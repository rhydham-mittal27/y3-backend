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
  getRescheduleHistory,
  getParentTutorProfile,
  getParentPayments,
  getParentProgress,
  getStudyTipsController,
  askAIController,
  getChildProfile,
  updateChildProfile,
  createShiftRequest,
  getShiftRequests,
  requestTutorChangeController,
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

// GET /api/v1/parents/reschedule-history
router.get('/reschedule-history', ...parentOnly, getRescheduleHistory);

// GET /api/v1/parents/tutor-profile
router.get('/tutor-profile', ...parentOnly, getParentTutorProfile);

// GET /api/v1/parents/payments
router.get('/payments', ...parentOnly, getParentPayments);

// GET /api/v1/parents/progress
router.get('/progress', ...parentOnly, getParentProgress);

// POST /api/v1/parents/ai/study-tips
router.post(
  '/ai/study-tips',
  ...parentOnly,
  [
    body('topic').notEmpty().trim().withMessage('topic is required'),
    body('subject').notEmpty().trim().withMessage('subject is required'),
    body('studentName').optional().trim(),
  ],
  getStudyTipsController,
);

// POST /api/v1/parents/ai/ask
router.post(
  '/ai/ask',
  ...parentOnly,
  [body('question').notEmpty().trim().isLength({ max: 500 }).withMessage('question is required (max 500 chars)')],
  askAIController,
);

// POST /api/v1/parents/shift-request
router.post(
  '/shift-request',
  ...parentOnly,
  [
    body('effectiveDate').notEmpty().withMessage('effectiveDate is required'),
    body('shiftDays').isInt({ min: 1 }).withMessage('shiftDays must be a positive integer'),
    body('reason').notEmpty().trim().isLength({ max: 500 }).withMessage('Reason required (max 500 chars)'),
  ],
  createShiftRequest,
);

// GET /api/v1/parents/shift-requests
router.get('/shift-requests', ...parentOnly, getShiftRequests);

// POST /api/v1/parents/request-tutor-change
router.post(
  '/request-tutor-change',
  ...parentOnly,
  [body('reason').notEmpty().trim().isLength({ max: 1000 }).withMessage('Reason is required (max 1000 chars)')],
  requestTutorChangeController,
);

// GET  /api/v1/parents/child-profile
router.get('/child-profile', ...parentOnly, getChildProfile);

// PATCH /api/v1/parents/child-profile
router.patch(
  '/child-profile',
  ...parentOnly,
  [
    body('primaryStudentName').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes max 500 chars'),
  ],
  updateChildProfile,
);

export default router;
