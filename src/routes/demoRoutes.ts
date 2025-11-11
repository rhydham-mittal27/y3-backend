import { Router } from 'express';
import {
  assignDemoController,
  updateDemoStatusController,
  editDemoController,
  reassignDemoController,
  getDemoHistoryController,
  getTutorDemoHistoryController,
  getMyDemosController,
} from '../controllers/demoController';
import {
  assignDemoValidation,
  updateDemoStatusValidation,
  editDemoValidation,
  reassignDemoValidation,
  leadIdParamValidation,
  tutorIdParamValidation,
} from '../validators/demoValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/assign/:leadId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  assignDemoValidation,
  assignDemoController
);

router.patch(
  '/status/:leadId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateDemoStatusValidation,
  updateDemoStatusController
);

router.put(
  '/edit/:leadId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  editDemoValidation,
  editDemoController
);

router.post(
  '/reassign/:leadId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  reassignDemoValidation,
  reassignDemoController
);

router.get(
  '/history/:leadId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  leadIdParamValidation,
  getDemoHistoryController
);

router.get(
  '/tutor-history/:tutorId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR),
  tutorIdParamValidation,
  getTutorDemoHistoryController
);

router.get(
  '/tutor/my-demos',
  authorize(USER_ROLES.TUTOR),
  getMyDemosController
);

export default router;
