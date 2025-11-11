import { Router } from 'express';
import {
  createManagerProfileController,
  getManagers,
  getManager,
  getManagerByUser,
  getMyProfile,
  updateManagerProfileController,
  getManagerMetricsController,
  getManagerPerformanceHistoryController,
  getManagerActivityLogController,
  getManagerContributionController,
  getMyMetrics,
  getMyActivityLog,
  deleteManagerProfileController,
} from '../controllers/managerController';
import {
  createManagerValidation,
  updateManagerValidation,
  managerIdValidation,
  userIdParamValidation,
  metricsQueryValidation,
  performanceHistoryValidation,
  activityLogValidation,
} from '../validators/managerValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import { getEligibleUsers } from '../controllers/coordinatorController';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.ADMIN), createManagerValidation, createManagerProfileController);
router.get('/', authorize(USER_ROLES.ADMIN), getManagers);
router.get('/my-profile', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getMyProfile);
router.get('/my-metrics', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), metricsQueryValidation, getMyMetrics);
router.get('/my-activity-log', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), activityLogValidation, getMyActivityLog);
router.get('/user/:userId', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), userIdParamValidation, getManagerByUser);
// Specific alias before generic ':id' routes to avoid CastError
router.get('/eligible-users', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getEligibleUsers);
router.get('/:id', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, getManager);
router.get('/:id/metrics', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, metricsQueryValidation, getManagerMetricsController);
router.get('/:id/performance-history', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), performanceHistoryValidation, getManagerPerformanceHistoryController);
router.get('/:id/activity-log', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), activityLogValidation, getManagerActivityLogController);
router.get('/:id/contribution', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER), managerIdValidation, metricsQueryValidation, getManagerContributionController);
router.put('/:id', authorize(USER_ROLES.ADMIN), updateManagerValidation, updateManagerProfileController);
router.delete('/:id', authorize(USER_ROLES.ADMIN), managerIdValidation, deleteManagerProfileController);

export default router;
