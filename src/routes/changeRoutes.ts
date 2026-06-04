import { Router } from 'express';
import { listChanges, getChange, getDocumentChangeHistory } from '../controllers/changeController';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

// All change routes require authentication and ADMIN or MANAGER role
router.use(protect);
router.use(authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER));

/**
 * GET /api/changes
 * List changes with filters: collection, documentId, changedBy, action, fromDate, toDate, page, limit
 */
router.get('/', listChanges);

/**
 * GET /api/changes/document/:collection/:documentId
 * Full history for a specific document — must come BEFORE /:id to avoid matching collision
 */
router.get('/document/:collection/:documentId', getDocumentChangeHistory);

/**
 * GET /api/changes/:id
 * Single change record by its _id
 */
router.get('/:id', getChange);

export default router;
