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
  getMyTestsForParent,
  uploadTestPaperController,
  uploadTestAnswerSheetController,
  getSyllabusCoverageController,
  getTutorComplianceController,
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
import { uploadDocument } from '../middlewares/fileUpload';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR),
  scheduleTestValidation,
  scheduleTestController
);

router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR), getTests);

router.get('/coordinator/tests', authorize(USER_ROLES.COORDINATOR), getCoordinatorTests);

router.get('/parent/my-tests', authorize(USER_ROLES.PARENT), getMyTestsForParent);

router.get('/tutor/compliance', authorize(USER_ROLES.TUTOR), getTutorComplianceController);

router.get(
  '/class/:classId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  classIdParamValidation,
  getClassTests
);

router.get(
  '/class/:classId/coverage',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  classIdParamValidation,
  getSyllabusCoverageController
);

router.get(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  testIdValidation,
  getTest
);

router.get('/:id/export-pdf', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), testIdValidation, exportTestReportPDF);

router.put('/:id', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateTestValidation, updateTestController);

router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), testIdValidation, deleteTestController);

router.patch('/:id/status', authorize(USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateTestStatusValidation, updateTestStatusController);

router.patch('/:id/report', authorize(USER_ROLES.TUTOR), submitTestReportValidation, submitTestReportController);

router.post(
  '/:id/paper',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  uploadDocument,
  testIdValidation,
  uploadTestPaperController
);

router.post(
  '/:id/report-file',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR),
  uploadDocument,
  testIdValidation,
  uploadTestAnswerSheetController
);

router.patch('/:id/cancel', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), cancelTestValidation, cancelTestController);

export default router;
