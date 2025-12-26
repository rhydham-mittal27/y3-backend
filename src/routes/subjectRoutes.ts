import { Router } from 'express';
import { getSubjectsController, createSubjectController } from '../controllers/subjectController';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.get('/', getSubjectsController);
router.post('/', protect, authorize(USER_ROLES.ADMIN), createSubjectController);

export default router;
