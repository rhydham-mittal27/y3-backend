import { body, param } from 'express-validator';
import { DEMO_STATUS } from '../config/constants';

export const assignDemoValidation = [
  param('leadId').isMongoId().withMessage('Invalid lead ID'),
  body('tutorUserId').notEmpty().withMessage('Tutor user ID is required').isMongoId().withMessage('Invalid tutor user ID'),
  body('demoDate').notEmpty().withMessage('Demo date is required').isISO8601().withMessage('Invalid date format'),
  body('demoTime').trim().notEmpty().withMessage('Demo time is required').isLength({ min: 2, max: 50 }).withMessage('Demo time must be 2-50 characters'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const updateDemoStatusValidation = [
  param('leadId').isMongoId().withMessage('Invalid lead ID'),
  body('status').notEmpty().withMessage('Status is required').isIn(Object.values(DEMO_STATUS)).withMessage('Invalid demo status'),
  body('feedback').optional().trim().isLength({ max: 1000 }).withMessage('Feedback must not exceed 1000 characters'),
  body('rejectionReason').optional().trim().isLength({ max: 500 }).withMessage('Rejection reason must not exceed 500 characters'),
];

export const editDemoValidation = [
  param('leadId').isMongoId().withMessage('Invalid lead ID'),
  body('demoDate').optional().isISO8601().withMessage('Invalid date format'),
  body('demoTime').optional().trim().isLength({ min: 2, max: 50 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

export const reassignDemoValidation = [
  param('leadId').isMongoId().withMessage('Invalid lead ID'),
  body('newTutorUserId').notEmpty().withMessage('New tutor user ID is required').isMongoId().withMessage('Invalid tutor user ID'),
  body('demoDate').notEmpty().withMessage('Demo date is required').isISO8601().withMessage('Invalid date format'),
  body('demoTime').trim().notEmpty().withMessage('Demo time is required').isLength({ min: 2, max: 50 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

export const leadIdParamValidation = [param('leadId').isMongoId().withMessage('Invalid lead ID')];

export const tutorIdParamValidation = [param('tutorId').isMongoId().withMessage('Invalid tutor ID')];
