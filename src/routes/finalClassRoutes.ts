import { Router } from 'express';
import {
  convertToFinalClass,
  getFinalClasses,
  getFinalClass,
  updateFinalClassDetails,
  updateClassStatus,
  updateProgress,
  getCoordinatorClasses,
  getTutorClasses,
  getMyClassesController,
  getParentClassesController,
} from '../controllers/finalClassController';
import {
  convertToFinalClassValidation,
  updateFinalClassValidation,
  updateClassStatusValidation,
  updateProgressValidation,
  classIdValidation,
  coordinatorIdParamValidation,
  tutorIdParamValidation,
} from '../validators/finalClassValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post('/convert/:leadId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), convertToFinalClassValidation, convertToFinalClass);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.PARENT), getFinalClasses);
router.get('/coordinator/:coordinatorId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), coordinatorIdParamValidation, getCoordinatorClasses);
router.get('/tutor/:tutorId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR), tutorIdParamValidation, getTutorClasses);
router.get(
  '/tutor/my-classes',
  authorize(USER_ROLES.TUTOR),
  getMyClassesController
);
router.get(
  '/parent/my-classes',
  authorize(USER_ROLES.PARENT),
  getParentClassesController
);
router.get(
  '/:id',
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.COORDINATOR,
    USER_ROLES.TUTOR,
    USER_ROLES.PARENT
  ),
  classIdValidation,
  getFinalClass
);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR,USER_ROLES.TUTOR), updateFinalClassValidation, updateFinalClassDetails);
router.patch('/:id/status', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateClassStatusValidation, updateClassStatus);
router.patch('/:id/progress', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), updateProgressValidation, updateProgress);

export default router;