import { Router } from "express";
import {
  createTutorProfileController,
  getTutors,
  getTutor,
  getTutorByUser,
  getMyProfile,
  getMyProfileForEditController,
  updateMyProfileController,
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
  getTutorAdvancedAnalyticsController,
  getCoordinatorTutorsController,
  getPublicTutorReviewsController,
  getPublicTutorProfileController,
  getSubjectsController,
  getVerifiersController,
  getCitiesController,
  getAreasController,
  getTutorStatsController,
  updateVerificationFeeStatusController,
} from "../controllers/tutorController";
import { getTutorClasses } from "../controllers/finalClassController";
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
} from "../validators/tutorValidator";
import protect from "../middlewares/auth";
import authorize from "../middlewares/authorize";
import { requireManagerPermissions } from "../middlewares/managerPermissions";
import { uploadDocument } from "../middlewares/fileUpload";
import { USER_ROLES } from "../config/constants";

const router = Router();

// Public read-only route for showing tutor reviews on public profiles (teacherId or internal id)
router.get("/public/:teacherKey/reviews", getPublicTutorReviewsController);

// Public read-only route for showing tutor profile details by teacherId
router.get("/public/:teacherId", getPublicTutorProfileController);

router.use(protect);

router.post(
  "/",
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  createTutorValidation,
  createTutorProfileController,
);

router.get(
  "/subjects",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR, USER_ROLES.COORDINATOR),
  getSubjectsController,
);

router.get(
  "/verifiers",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  getVerifiersController,
);
router.get(
  "/cities",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR, USER_ROLES.COORDINATOR),
  getCitiesController,
);
router.get(
  "/areas",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR, USER_ROLES.COORDINATOR),
  getAreasController,
);

router.get("/", authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getTutors);

router.get("/my-profile", authorize(USER_ROLES.TUTOR), getMyProfile);

router.get(
  "/my-profile/for-edit",
  authorize(USER_ROLES.TUTOR),
  getMyProfileForEditController,
);

router.put(
  "/my-profile",
  authorize(USER_ROLES.TUTOR),
  updateMyProfileController,
);

router.get(
  "/pending-verifications",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requireManagerPermissions("canVerifyTutors"),
  getPendingVerifications,
);

router.get(
  "/status/:status",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  statusParamValidation,
  getTutorsByStatus,
);

router.get(
  "/user/:userId",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.TUTOR,
    USER_ROLES.PARENT,
  ),
  userIdParamValidation,
  getTutorByUser,
);

router.get(
  "/:id",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.TUTOR,
    USER_ROLES.PARENT,
  ),
  tutorIdValidation,
  getTutor,
);

router.get(
  "/:tutorId/classes",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.TUTOR,
    USER_ROLES.PARENT,
  ),
  tutorIdParamValidation,
  getTutorClasses,
);

router.put(
  "/:id",
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateTutorValidation,
  updateTutorProfileController,
);

router.patch(
  "/:tutorId/settings",
  authorize(USER_ROLES.TUTOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateTutorSettingsController,
);

router.delete(
  "/:id",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  tutorIdValidation,
  deleteTutorProfileController,
);

router.post(
  "/:id/documents",
  authorize(USER_ROLES.TUTOR),
  uploadDocument,
  uploadDocumentValidation,
  uploadDocumentController,
);

router.delete(
  "/:id/documents/:documentIndex",
  authorize(USER_ROLES.TUTOR),
  deleteDocumentValidation,
  deleteDocumentController,
);

router.patch(
  "/:id/verification-status",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requireManagerPermissions("canVerifyTutors"),
  updateVerificationStatusValidation,
  updateVerificationStatusController,
);

router.patch(
  "/:id/verification-fee",
  authorize(
    USER_ROLES.TUTOR,
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.COORDINATOR,
  ),
  uploadDocument, // reuse multer middleware for file upload
  updateVerificationFeeStatusController,
);

// Tier management and feedback routes
router.post(
  "/tier/request",
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requestTierChangeValidation,
  requestTierChangeController,
);

router.patch(
  "/:tutorId/tier/approve",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  approveTierChangeValidation,
  approveTierChangeController,
);

router.post(
  "/feedback",
  authorize(USER_ROLES.PARENT),
  submitTutorFeedbackValidation,
  submitTutorFeedbackController,
);

router.get(
  "/:tutorId/feedback",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.COORDINATOR,
    USER_ROLES.TUTOR,
  ),
  tutorIdParamValidation,
  getTutorFeedbackController,
);

router.get(
  "/:tutorId/performance",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.COORDINATOR,
    USER_ROLES.TUTOR,
  ),
  tutorIdParamValidation,
  getTutorPerformanceMetricsController,
);
router.get(
  "/:tutorId/advanced-analytics",
  authorize(
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN,
    USER_ROLES.COORDINATOR,
    USER_ROLES.TUTOR,
  ),
  tutorIdParamValidation,
  getTutorAdvancedAnalyticsController,
);

router.get(
  "/:id/stats",
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  tutorIdValidation,
  getTutorStatsController,
);

router.get(
  "/coordinator/tutors",
  authorize(USER_ROLES.COORDINATOR),
  getCoordinatorTutorsController,
);

export default router;
