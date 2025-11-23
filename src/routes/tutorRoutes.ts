import { Router } from 'express';
import {
  createTutorProfileController,
  getTutors,
  getTutor,
  getTutorByUser,
  getMyProfile,
  updateTutorProfileController,
  updateTutorSettingsController,
  uploadDocumentController,
  deleteDocumentController,
  updateVerificationStatusController,
  getTutorsByStatus,
  getPendingVerifications,
  deleteTutorProfileController,
  requestTierChangeController,
  approveTierChangeController,
  submitTutorFeedbackController,
  getTutorFeedbackController,
  getTutorPerformanceMetricsController,
  getCoordinatorTutorsController,
} from '../controllers/tutorController';
import {
  createTutorValidation,
  updateTutorValidation,
  uploadDocumentValidation,
  deleteDocumentValidation,
  updateVerificationStatusValidation,
  tutorIdValidation,
  userIdParamValidation,
  statusParamValidation,
  requestTierChangeValidation,
  approveTierChangeValidation,
  submitTutorFeedbackValidation,
  tutorIdParamValidation,
} from '../validators/tutorValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { uploadDocument } from '../middlewares/fileUpload';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  createTutorValidation,
  createTutorProfileController
);

router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getTutors);

router.get('/my-profile', authorize(USER_ROLES.TUTOR), getMyProfile);

router.get(
  '/pending-verifications',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  getPendingVerifications
);

router.get(
  '/status/:status',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  statusParamValidation,
  getTutorsByStatus
);

router.get(
  '/user/:userId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR),
  userIdParamValidation,
  getTutorByUser
);

router.get(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR),
  tutorIdValidation,
  getTutor
);

router.put(
  '/:id',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateTutorValidation,
  updateTutorProfileController
);

router.patch(
  '/:tutorId/settings',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateTutorSettingsController
);

router.delete(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  tutorIdValidation,
  deleteTutorProfileController
);

router.post(
  '/:id/documents',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  uploadDocument,
  uploadDocumentValidation,
  uploadDocumentController
);

router.delete(
  '/:id/documents/:documentIndex',
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  deleteDocumentValidation,
  deleteDocumentController
);

router.patch(
  '/:id/verification-status',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateVerificationStatusValidation,
  updateVerificationStatusController
);

// Tier management and feedback routes
router.post(
  '/tier/request',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requestTierChangeValidation,
  requestTierChangeController
);

router.patch(
  '/:tutorId/tier/approve',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  approveTierChangeValidation,
  approveTierChangeController
);

router.post(
  '/feedback',
  authorize(USER_ROLES.PARENT),
  submitTutorFeedbackValidation,
  submitTutorFeedbackController
);

router.get(
  '/:tutorId/feedback',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR),
  tutorIdParamValidation,
  getTutorFeedbackController
);

router.get(
  '/:tutorId/performance',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR),
  tutorIdParamValidation,
  getTutorPerformanceMetricsController
);

router.get(
  '/coordinator/tutors',
  authorize(USER_ROLES.COORDINATOR),
  getCoordinatorTutorsController
);

export default router;
