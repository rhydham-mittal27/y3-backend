import { Router } from 'express';
import {
  createAttendanceRecord,
  getAttendances,
  getAttendance,
  coordinatorApproveAttendance,
  parentApproveAttendance,
  rejectAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  getClassAttendance,
  getClassAttendanceHistory,
  getCoordinatorPendingApprovals,
  getParentPendingApprovals,
} from '../controllers/attendanceController';
import {
  createAttendanceValidation,
  updateAttendanceValidation,
  rejectAttendanceValidation,
  attendanceIdValidation,
  classIdParamValidation,
} from '../validators/attendanceValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  createAttendanceValidation,
  createAttendanceRecord
);

router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR), getAttendances);

router.get('/coordinator/pending', authorize(USER_ROLES.COORDINATOR), getCoordinatorPendingApprovals);

router.get('/parent/pending', authorize(USER_ROLES.PARENT), getParentPendingApprovals);

router.get(
  '/class/:classId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  classIdParamValidation,
  getClassAttendance
);

router.get(
  '/class/:classId/history',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR),
  classIdParamValidation,
  getClassAttendanceHistory
);

router.get(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  attendanceIdValidation,
  getAttendance
);

router.put(
  '/:id',
  authorize(USER_ROLES.TUTOR, USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  updateAttendanceValidation,
  updateAttendanceRecord
);

router.delete(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR),
  attendanceIdValidation,
  deleteAttendanceRecord
);

router.patch(
  '/:id/coordinator-approve',
  authorize(USER_ROLES.COORDINATOR),
  attendanceIdValidation,
  coordinatorApproveAttendance
);

router.patch(
  '/:id/parent-approve',
  authorize(USER_ROLES.PARENT),
  attendanceIdValidation,
  parentApproveAttendance
);

router.patch(
  '/:id/reject',
  authorize(USER_ROLES.COORDINATOR, USER_ROLES.PARENT),
  rejectAttendanceValidation,
  rejectAttendanceRecord
);

export default router;
