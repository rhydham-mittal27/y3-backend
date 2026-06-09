import { Router } from 'express';
import { registerParent, getMyParentProfile } from '../controllers/parentLeadController';
import { registerParentValidation } from '../validators/parentValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

// POST /api/v1/parents/register  — public
router.post('/register', registerParentValidation, registerParent);

// GET /api/v1/parents/me  — protected, parent only
router.get('/me', protect, authorize(USER_ROLES.PARENT), getMyParentProfile);

export default router;
