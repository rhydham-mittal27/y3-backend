import { body, param, query } from 'express-validator';
import { USER_ROLES, PAYMENT_STATUS } from '../config/constants';

export const createAdminValidation = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),
  body('department').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Department must be 2-100 characters'),
];

export const updateAdminValidation = [
  param('id').isMongoId().withMessage('Invalid admin ID'),
  body('department').optional().trim().isLength({ min: 2, max: 100 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const adminIdValidation = [
  param('id').isMongoId().withMessage('Invalid admin ID'),
];

export const userIdParamValidation = [
  param('userId').isMongoId().withMessage('Invalid user ID'),
];

export const analyticsQueryValidation = [
  query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date format'),
];

export const exportAnalyticsValidation = [
  query('reportType').notEmpty().withMessage('reportType is required').isString(),
  query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date format'),
];

export const bulkUpdateUsersValidation = [
  body('filter').notEmpty().withMessage('Filter is required'),
  body('filter.role').optional().isIn(Object.values(USER_ROLES)).withMessage('Invalid role'),
  body('filter.isActive').optional().isBoolean(),
  body('filter.ids').optional().isArray().withMessage('IDs must be an array'),
  body('filter.ids.*').optional().isMongoId().withMessage('Invalid ID in array'),
  body('updateData').notEmpty().withMessage('Update data is required'),
  body('updateData.isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const bulkUpdateManagersValidation = [
  body('filter').notEmpty().withMessage('Filter is required'),
  body('filter.isActive').optional().isBoolean(),
  body('filter.department').optional().trim().isLength({ min: 2, max: 100 }),
  body('filter.ids').optional().isArray(),
  body('filter.ids.*').optional().isMongoId(),
  body('updateData').notEmpty().withMessage('Update data is required'),
  body('updateData.isActive').optional().isBoolean(),
  body('updateData.department').optional().trim().isLength({ min: 2, max: 100 }),
];

export const bulkUpdateCoordinatorsValidation = [
  body('filter').notEmpty().withMessage('Filter is required'),
  body('filter.isActive').optional().isBoolean(),
  body('filter.ids').optional().isArray(),
  body('filter.ids.*').optional().isMongoId(),
  body('updateData').notEmpty().withMessage('Update data is required'),
  body('updateData.isActive').optional().isBoolean(),
  body('updateData.maxClassCapacity').optional().isInt({ min: 1, max: 100 }).withMessage('Max class capacity must be between 1 and 100'),
];

export const bulkUpdatePaymentsValidation = [
  body('filter').notEmpty().withMessage('Filter is required'),
  body('filter.status').optional().isIn(Object.values(PAYMENT_STATUS)).withMessage('Invalid payment status'),
  body('filter.finalClassId').optional().isMongoId().withMessage('Invalid final class ID'),
  body('filter.tutorId').optional().isMongoId().withMessage('Invalid tutor ID'),
  body('filter.ids').optional().isArray(),
  body('filter.ids.*').optional().isMongoId(),
  body('filter.fromDate').optional().isISO8601().withMessage('Invalid from date'),
  body('filter.toDate').optional().isISO8601().withMessage('Invalid to date'),
  body('updateData').notEmpty().withMessage('Update data is required'),
  body('updateData.status').optional().isIn(Object.values(PAYMENT_STATUS)).withMessage('Invalid payment status'),
  body('updateData.paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
  body('updateData.paidBy').optional().isMongoId().withMessage('Invalid paidBy user ID'),
];

export const bulkDeleteRecordsValidation = [
  body('entityType').notEmpty().withMessage('Entity type is required').isIn(['ClassLead', 'Payment', 'Attendance']).withMessage('Invalid entity type'),
  body('filter').notEmpty().withMessage('Filter is required'),
  body('filter.ids').notEmpty().withMessage('IDs array is required'),
  body('filter.ids').isArray({ min: 1, max: 100 }).withMessage('IDs must be an array with 1-100 items'),
  body('filter.ids.*').isMongoId().withMessage('Invalid ID in array'),
];

export const createUserValidation = [
  body('userData').notEmpty().withMessage('User data is required'),
  body('userData.name').notEmpty().withMessage('Name is required').trim().isLength({ min: 2, max: 100 }),
  body('userData.email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('userData.password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('userData.phone').optional().trim().matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('userData.role').notEmpty().withMessage('Role is required').isIn(Object.values(USER_ROLES)).withMessage('Invalid role'),
];

export const bulkCreateUsersValidation = [
  body('usersData').notEmpty().withMessage('Users data is required'),
  body('usersData').isArray({ min: 1, max: 50 }).withMessage('Users data must be an array with 1-50 items'),
  body('usersData.*.name').notEmpty().trim().isLength({ min: 2, max: 100 }),
  body('usersData.*.email').notEmpty().isEmail().normalizeEmail(),
  body('usersData.*.password').notEmpty().isLength({ min: 6 }),
  body('usersData.*.phone').optional().trim().matches(/^[0-9]{10}$/),
  body('usersData.*.role').notEmpty().isIn(Object.values(USER_ROLES)),
];

export const paginationQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  query('sortBy').optional().isString().trim(),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

export default {
  createAdminValidation,
  updateAdminValidation,
  adminIdValidation,
  userIdParamValidation,
  analyticsQueryValidation,
  bulkUpdateUsersValidation,
  bulkUpdateManagersValidation,
  bulkUpdateCoordinatorsValidation,
  bulkUpdatePaymentsValidation,
  bulkDeleteRecordsValidation,
  createUserValidation,
  bulkCreateUsersValidation,
  paginationQueryValidation,
};
