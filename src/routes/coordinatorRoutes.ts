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
  getPendingCoordinatorVerifications,
  updateCoordinatorVerificationStatusController,
  uploadCoordinatorDocumentController,
  deleteCoordinatorDocumentController,
  getMyActivityLogController,
  getCoordinatorActivityLogController,
  getPendingRescheduleRequestsController,
  approveRescheduleRequestController,
  rejectRescheduleRequestController,
} from '../controllers/coordinatorController';
import {
  createCoordinatorValidation,
  updateCoordinatorValidation,
  coordinatorIdValidation,
  userIdParamValidation,
  updateCoordinatorVerificationStatusValidation,
  uploadCoordinatorDocumentValidation,
  deleteCoordinatorDocumentValidation,
  assignedClassesQueryValidation,
} from '../validators/coordinatorValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { requireManagerPermissions } from '../middlewares/managerPermissions';
import { uploadDocument } from '../middlewares/fileUpload';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

// Coordinator Dashboard Routes
router.get('/dashboard/stats', authorize(USER_ROLES.COORDINATOR), getDashboardStats);
router.get('/dashboard/tasks', authorize(USER_ROLES.COORDINATOR), getTodaysTasks);
router.get('/assigned-classes', authorize(USER_ROLES.COORDINATOR), assignedClassesQueryValidation, getAssignedClassesSummaryController);
router.get('/payments/summary', authorize(USER_ROLES.COORDINATOR), getPaymentSummary);
router.get('/profile/metrics', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), getProfileMetrics);
router.get('/eligible-users', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getEligibleUsers);
router.get('/my-activity-logs', authorize(USER_ROLES.COORDINATOR), getMyActivityLogController);
router.get('/:id/activity-logs', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), getCoordinatorActivityLogController);

router.get(
  '/pending-verifications',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requireManagerPermissions('canVerifyCoordinators'),
  getPendingCoordinatorVerifications
);

router.post('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), createCoordinatorValidation, createCoordinatorProfile);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getCoordinators);
router.get('/available', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getAvailableCoordinatorsController);
router.get('/user/:userId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), userIdParamValidation, getCoordinatorByUser);
router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), coordinatorIdValidation, getCoordinator);
router.get('/:id/workload', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), coordinatorIdValidation, getWorkload);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateCoordinatorValidation, updateCoordinatorProfile);

router.patch(
  '/:id/verification-status',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requireManagerPermissions('canVerifyCoordinators'),
  updateCoordinatorVerificationStatusValidation,
  updateCoordinatorVerificationStatusController
);

router.post(
  '/:id/documents',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  uploadDocument,
  uploadCoordinatorDocumentValidation,
  uploadCoordinatorDocumentController
);

router.delete(
  '/:id/documents/:documentIndex',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  deleteCoordinatorDocumentValidation,
  deleteCoordinatorDocumentController
);
router.patch('/:coordinatorId/settings', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateCoordinatorSettingsController);
router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), coordinatorIdValidation, deleteCoordinatorProfile);

// Reschedule requests
router.get('/reschedule-requests', authorize(USER_ROLES.COORDINATOR), getPendingRescheduleRequestsController);
router.post('/reschedule-requests/:classId/:requestId/approve', authorize(USER_ROLES.COORDINATOR), approveRescheduleRequestController);
router.post('/reschedule-requests/:classId/:requestId/reject', authorize(USER_ROLES.COORDINATOR), rejectRescheduleRequestController);

export default router;
