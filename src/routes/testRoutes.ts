import { Router } from 'express';
import {
  scheduleTestController,
  getTests,
  getTest,
  getClassTests,
  updateTestStatusController,
  submitTestReportController,
  updateTestController,
  cancelTestController,
  deleteTestController,
  getCoordinatorTests,
  exportTestReportPDF,
} from '../controllers/testController';
import {
  scheduleTestValidation,
  updateTestValidation,
  submitTestReportValidation,
  updateTestStatusValidation,
  cancelTestValidation,
  testIdValidation,
  classIdParamValidation,
} from '../validators/testValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), scheduleTestValidation, scheduleTestController);

router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), getTests);

router.get('/coordinator/tests', authorize(USER_ROLES.COORDINATOR), getCoordinatorTests);

router.get('/class/:classId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR), classIdParamValidation, getClassTests);

router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR), testIdValidation, getTest);

router.get('/:id/export-pdf', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), testIdValidation, exportTestReportPDF);

router.put('/:id', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateTestValidation, updateTestController);

router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), testIdValidation, deleteTestController);

router.patch('/:id/status', authorize(USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateTestStatusValidation, updateTestStatusController);

router.patch('/:id/report', authorize(USER_ROLES.TUTOR), submitTestReportValidation, submitTestReportController);

router.patch('/:id/cancel', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), cancelTestValidation, cancelTestController);

export default router;
