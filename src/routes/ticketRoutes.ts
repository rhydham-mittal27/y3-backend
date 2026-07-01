import { Router } from 'express';
import { body } from 'express-validator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import {
  createTicketController,
  getMyTicketsController,
  listTicketsController,
  ticketStatsController,
  getTicketController,
  addCommentController,
  updateStatusController,
} from '../controllers/ticketController';

const router = Router();
router.use(protect);

const STAFF = [USER_ROLES.COORDINATOR, USER_ROLES.ADMIN, USER_ROLES.MANAGER];

// Parent: create ticket
router.post(
  '/',
  authorize(USER_ROLES.PARENT),
  [
    body('subject').notEmpty().trim().isLength({ max: 200 }).withMessage('subject is required (max 200)'),
    body('description').notEmpty().trim().isLength({ max: 2000 }).withMessage('description is required (max 2000)'),
    body('type').optional().isIn(['CONCERN', 'COMPLAINT', 'QUERY', 'TECHNICAL', 'OTHER']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
    body('finalClassId').optional().isMongoId(),
  ],
  createTicketController,
);

// Parent: list own tickets
router.get('/my', authorize(USER_ROLES.PARENT), getMyTicketsController);

// Staff: stats
router.get('/stats', authorize(...STAFF), ticketStatsController);

// Staff: list all / filtered tickets
router.get('/', authorize(...STAFF), listTicketsController);

// Shared: get single ticket (owner or assigned staff or admin)
router.get('/:id', authorize(USER_ROLES.PARENT, ...STAFF), getTicketController);

// Shared: add comment
router.post(
  '/:id/comments',
  authorize(USER_ROLES.PARENT, ...STAFF),
  [body('message').notEmpty().trim().isLength({ max: 1000 }).withMessage('message required (max 1000)')],
  addCommentController,
);

// Staff: update status / resolve
router.patch(
  '/:id/status',
  authorize(...STAFF),
  [
    body('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
    body('resolutionNote').optional().trim().isLength({ max: 1000 }),
    body('assignedTo').optional().isMongoId(),
  ],
  updateStatusController,
);

export default router;
