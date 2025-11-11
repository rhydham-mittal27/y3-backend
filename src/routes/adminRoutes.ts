import { Router } from 'express';
import {
  createAdminProfileController,
  getAdmins,
  getAdmin,
  getAdminByUser,
  getMyProfile,
  updateAdminProfileController,
  deleteAdminProfileController,
  getSystemAnalytics,
  exportAnalyticsCSVController,
  exportAnalyticsPDFController,
  bulkUpdateUsersController,
  bulkUpdateManagersController,
  bulkUpdateCoordinatorsController,
  bulkUpdatePaymentsController,
  bulkDeleteRecordsController,
  createUserController,
  bulkCreateUsersController,
} from '../controllers/adminController';
import {
  createAdminValidation,
  updateAdminValidation,
  adminIdValidation,
  userIdParamValidation,
  analyticsQueryValidation,
  exportAnalyticsValidation,
  bulkUpdateUsersValidation,
  bulkUpdateManagersValidation,
  bulkUpdateCoordinatorsValidation,
  bulkUpdatePaymentsValidation,
  bulkDeleteRecordsValidation,
  createUserValidation,
  bulkCreateUsersValidation,
  paginationQueryValidation,
} from '../validators/adminValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

// Admin Profile Management Routes
router.post('/', authorize(USER_ROLES.ADMIN), createAdminValidation, createAdminProfileController);
router.get('/', authorize(USER_ROLES.ADMIN), paginationQueryValidation, getAdmins);
router.get('/my-profile', authorize(USER_ROLES.ADMIN), getMyProfile);
router.get('/user/:userId', authorize(USER_ROLES.ADMIN), userIdParamValidation, getAdminByUser);

// System Analytics Routes (specific paths before generic ':id')
router.get('/analytics', authorize(USER_ROLES.ADMIN), analyticsQueryValidation, getSystemAnalytics);
router.get('/analytics/export/csv', authorize(USER_ROLES.ADMIN), exportAnalyticsValidation, exportAnalyticsCSVController);
router.get('/analytics/export/pdf', authorize(USER_ROLES.ADMIN), exportAnalyticsValidation, exportAnalyticsPDFController);

// User Management Routes
router.post('/users', authorize(USER_ROLES.ADMIN), createUserValidation, createUserController);
router.post('/users/bulk', authorize(USER_ROLES.ADMIN), bulkCreateUsersValidation, bulkCreateUsersController);

// Bulk Data Operations Routes
router.put('/bulk/users', authorize(USER_ROLES.ADMIN), bulkUpdateUsersValidation, bulkUpdateUsersController);
router.put('/bulk/managers', authorize(USER_ROLES.ADMIN), bulkUpdateManagersValidation, bulkUpdateManagersController);
router.put('/bulk/coordinators', authorize(USER_ROLES.ADMIN), bulkUpdateCoordinatorsValidation, bulkUpdateCoordinatorsController);
router.put('/bulk/payments', authorize(USER_ROLES.ADMIN), bulkUpdatePaymentsValidation, bulkUpdatePaymentsController);
router.delete('/bulk/records', authorize(USER_ROLES.ADMIN), bulkDeleteRecordsValidation, bulkDeleteRecordsController);

// Generic ID routes (placed last)
router.get('/:id', authorize(USER_ROLES.ADMIN), adminIdValidation, getAdmin);
router.put('/:id', authorize(USER_ROLES.ADMIN), updateAdminValidation, updateAdminProfileController);
router.delete('/:id', authorize(USER_ROLES.ADMIN), adminIdValidation, deleteAdminProfileController);

export default router;
