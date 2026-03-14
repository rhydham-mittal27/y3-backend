import { Router } from 'express';
import {
  createManagerProfileController,
  getManagers,
  getManager,
  getManagerByUser,
  getMyProfile,
  updateManagerProfileController,
  updateManagerSettingsController,
  getManagerMetricsController,
  getManagerPerformanceHistoryController,
  getManagerActivityLogController,
  getManagerContributionController,
  getMyMetrics,
  getMyActivityLog,
  deleteManagerProfileController,
  getManagerTodoListController,
  uploadManagerDocumentsController,
  uploadManagerDocumentController,
  getEligibleManagerUsersController,
  viewManagerDocumentController,
} from '../controllers/managerController';
import {
  createManagerValidation,
  updateManagerValidation,
  managerIdValidation,
  managerDocumentViewValidation,
  userIdParamValidation,
  metricsQueryValidation,
  performanceHistoryValidation,
  activityLogValidation,
} from '../validators/managerValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

import { uploadDocument } from '../middlewares/fileUpload';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.ADMIN), createManagerValidation, createManagerProfileController);
router.get('/', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.COORDINATOR), getManagers);
router.get('/my-profile', authorize(USER_ROLES.MANAGER), getMyProfile);
router.get('/my-metrics', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), metricsQueryValidation, getMyMetrics);
router.get('/my-activity-log', authorize(USER_ROLES.MANAGER), activityLogValidation, getMyActivityLog);
router.get('/todo-list', authorize(USER_ROLES.MANAGER), getManagerTodoListController);
router.get('/user/:userId', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), userIdParamValidation, getManagerByUser);
router.post('/upload-documents', authorize(USER_ROLES.MANAGER), uploadManagerDocumentsController);
router.post('/upload-document', authorize(USER_ROLES.MANAGER), uploadDocument, uploadManagerDocumentController);
// Specific alias before generic ':id' routes to avoid CastError
router.get('/eligible-users', authorize(USER_ROLES.ADMIN), getEligibleManagerUsersController);
router.get(
  '/:id/documents/:docIndex/view.:ext',
  authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  managerDocumentViewValidation,
  viewManagerDocumentController
);
router.get(
  '/:id/documents/:docIndex/view',
  authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  managerDocumentViewValidation,
  viewManagerDocumentController
);
router.get('/:id', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, getManager);
router.get('/:id/metrics', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, metricsQueryValidation, getManagerMetricsController);
router.get('/:id/performance-history', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), performanceHistoryValidation, getManagerPerformanceHistoryController);
router.get('/:id/activity-log', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), activityLogValidation, getManagerActivityLogController);
router.get('/:id/contribution', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, metricsQueryValidation, getManagerContributionController);
router.put('/:id', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), updateManagerValidation, updateManagerProfileController);
router.patch('/:managerId/settings', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateManagerSettingsController);
router.delete('/:id', authorize(USER_ROLES.ADMIN), managerIdValidation, deleteManagerProfileController);

export default router;
