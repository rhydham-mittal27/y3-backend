import { Router } from 'express';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import {
  upsertAttendanceSheetController,
  submitAttendanceSheetController,
  getCoordinatorPendingSheetsController,
  getAllPendingSheetsController,
  approveAttendanceSheetController,
  rejectAttendanceSheetController,
} from '../controllers/attendanceSheetController';

const router = Router();

router.use(protect);

// Generate or update a monthly attendance sheet for a class
router.post(
  '/',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  upsertAttendanceSheetController
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

export default router;
