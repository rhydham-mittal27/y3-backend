import { Router } from 'express';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import {
  addDailyAttendanceController,
  submitAttendanceSheetController,
  getCoordinatorPendingSheetsController,
  getCoordinatorAllSheetsController,
  getAllPendingSheetsController,
  approveAttendanceSheetController,
  rejectAttendanceSheetController,
  getSheetsForClassController,
  getAttendanceSheetPaymentsController,
  updateAttendanceSheetPaymentStatusController,
} from '../controllers/attendanceSheetController';

const router = Router();

router.use(protect);

// Add daily attendance record
router.post(
  '/',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  addDailyAttendanceController
);

// Get sheets for a class
router.get(
  '/class/:classId',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.PARENT, USER_ROLES.STUDENT),
  getSheetsForClassController
);

// Submit a sheet to the coordinator for approval
router.patch(
  '/:id/submit',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  submitAttendanceSheetController
);

// Admins/Managers: list all pending sheets
router.get(
  '/pending',
  authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  getAllPendingSheetsController
);

// Coordinator: list pending sheets
router.get(
  '/coordinator/pending',
  authorize(USER_ROLES.COORDINATOR),
  getCoordinatorPendingSheetsController
);

router.get(
  '/coordinator/all',
  authorize(USER_ROLES.COORDINATOR),
  getCoordinatorAllSheetsController
);

// Approve a sheet
router.patch(
  '/:id/approve',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  approveAttendanceSheetController
);

// Reject a sheet
router.patch(
  '/:id/reject',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  rejectAttendanceSheetController
);

router.get(
  '/:id/payments',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.PARENT, USER_ROLES.STUDENT),
  getAttendanceSheetPaymentsController
);

router.patch(
  '/:id/payments/:paymentId/status',
  authorize(USER_ROLES.COORDINATOR),
  updateAttendanceSheetPaymentStatusController
);

export default router;
