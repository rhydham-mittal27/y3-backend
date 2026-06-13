import { Router } from 'express';
import { body } from 'express-validator';
import {
  registerParent,
  getMyParentProfile,
  getParentDashboard,
  submitTutorRequest,
  raiseParentConcernController,
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

export default router;
