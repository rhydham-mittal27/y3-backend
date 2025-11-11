import { body, param, query } from 'express-validator';
import { MANAGER_ACTION_TYPE } from '../config/constants';

export const createManagerValidation = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),
  body('department').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Department must be 2-100 characters'),
];

export const updateManagerValidation = [
  param('id').isMongoId().withMessage('Invalid manager ID'),
  body('department').optional().trim().isLength({ min: 2, max: 100 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const managerIdValidation = [param('id').isMongoId().withMessage('Invalid manager ID')];

export const userIdParamValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];

export const metricsQueryValidation = [
  query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date format'),
];

export const performanceHistoryValidation = [
  param('id').isMongoId().withMessage('Invalid manager ID'),
  query('fromDate').notEmpty().withMessage('From date is required').isISO8601().withMessage('Invalid from date format'),
  query('toDate').notEmpty().withMessage('To date is required').isISO8601().withMessage('Invalid to date format'),
  query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid groupBy value'),
];

export const activityLogValidation = [
  param('id').isMongoId().withMessage('Invalid manager ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('actionType').optional().isIn(Object.values(MANAGER_ACTION_TYPE)).withMessage('Invalid action type'),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
  query('entityType').optional().isIn(['ClassLead', 'FinalClass', 'Demo', 'Payment', 'Tutor', 'Coordinator', 'Announcement']).withMessage('Invalid entity type'),
];

export default {
  createManagerValidation,
  updateManagerValidation,
  managerIdValidation,
  userIdParamValidation,
  metricsQueryValidation,
  performanceHistoryValidation,
  activityLogValidation,
};
