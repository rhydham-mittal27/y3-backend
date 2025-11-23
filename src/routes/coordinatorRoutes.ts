import { Router } from 'express';
import {
  createCoordinatorProfile,
  getCoordinators,
  getCoordinator,
  getCoordinatorByUser,
  updateCoordinatorProfile,
  updateCoordinatorSettingsController,
  deleteCoordinatorProfile,
  getWorkload,
  getAvailableCoordinatorsController,
  getDashboardStats,
  getTodaysTasks,
  getAssignedClassesSummaryController,
  getPaymentSummary,
  getProfileMetrics,
  getEligibleUsers,
} from '../controllers/coordinatorController';
import {
  createCoordinatorValidation,
  updateCoordinatorValidation,
  coordinatorIdValidation,
  userIdParamValidation,
  assignedClassesQueryValidation,
} from '../validators/coordinatorValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

// Coordinator Dashboard Routes
router.get('/dashboard/stats', authorize(USER_ROLES.COORDINATOR), getDashboardStats);
router.get('/dashboard/tasks', authorize(USER_ROLES.COORDINATOR), getTodaysTasks);
router.get('/assigned-classes', authorize(USER_ROLES.COORDINATOR), assignedClassesQueryValidation, getAssignedClassesSummaryController);
router.get('/payments/summary', authorize(USER_ROLES.COORDINATOR), getPaymentSummary);
router.get('/profile/metrics', authorize(USER_ROLES.COORDINATOR), getProfileMetrics);
router.get('/eligible-users', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getEligibleUsers);

router.post('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), createCoordinatorValidation, createCoordinatorProfile);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getCoordinators);
router.get('/available', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getAvailableCoordinatorsController);
router.get('/user/:userId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), userIdParamValidation, getCoordinatorByUser);
router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), coordinatorIdValidation, getCoordinator);
router.get('/:id/workload', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), coordinatorIdValidation, getWorkload);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateCoordinatorValidation, updateCoordinatorProfile);
router.patch('/:coordinatorId/settings', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateCoordinatorSettingsController);
router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), coordinatorIdValidation, deleteCoordinatorProfile);

export default router;
