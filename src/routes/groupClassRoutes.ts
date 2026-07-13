import { Router } from 'express';
import { renewGroupClassController } from '../controllers/groupClassController';
import { renewGroupClassValidation } from '../validators/groupClassValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/:id/renew',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  renewGroupClassValidation,
  renewGroupClassController
);

export default router;
