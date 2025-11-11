import { query } from 'express-validator';

export const dateRangeValidation = [
  query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date format'),
  query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid groupBy value, must be day, week, or month'),
];

export const requiredDateRangeValidation = [
  query('fromDate').notEmpty().withMessage('From date is required').isISO8601().withMessage('Invalid from date format'),
  query('toDate').notEmpty().withMessage('To date is required').isISO8601().withMessage('Invalid to date format'),
  query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('Invalid groupBy value, must be day, week, or month'),
];

export const tutorReportValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isIn(['ratings', 'classesCompleted', 'revenue', 'experienceHours']).withMessage('Invalid sortBy field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order'),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
];

export const exportValidation = [
  query('reportType').notEmpty().withMessage('Report type is required').isIn(['leads', 'classes', 'tutors', 'revenue', 'comprehensive']).withMessage('Invalid report type'),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
];
