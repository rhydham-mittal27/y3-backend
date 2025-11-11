import { body, param } from 'express-validator';
import { FINAL_CLASS_STATUS } from '../config/constants';

export const convertToFinalClassValidation = [
  param('leadId').isMongoId().withMessage('Invalid lead ID'),
  body('coordinatorUserId').notEmpty().withMessage('Coordinator user ID is required').isMongoId().withMessage('Invalid coordinator user ID'),
  body('parentUserId').optional().isMongoId().withMessage('Invalid parent user ID'),
  body('startDate').notEmpty().withMessage('Start date is required').isISO8601().withMessage('Invalid date format'),
  body('schedule').optional().isObject().withMessage('Schedule must be an object'),
  body('schedule.daysOfWeek').optional().isArray().withMessage('Days of week must be an array'),
  body('schedule.timeSlot').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Time slot must be 2-100 characters'),
  body('totalSessions').optional().isInt({ min: 0 }).withMessage('Total sessions must be non-negative integer'),
  body('ratePerSession').optional().isFloat({ min: 0 }).withMessage('Rate per session must be non-negative number'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
];

export const updateFinalClassValidation = [
  param('id').isMongoId().withMessage('Invalid class ID'),
  body('schedule').optional().isObject(),
  body('schedule.daysOfWeek').optional().isArray(),
  body('schedule.timeSlot').optional().trim().isLength({ min: 2, max: 100 }),
  body('totalSessions').optional().isInt({ min: 0 }),
  body('ratePerSession').optional().isFloat({ min: 0 }).withMessage('Rate per session must be non-negative number'),
  body('endDate').optional().isISO8601(),
  body('notes').optional().trim().isLength({ max: 1000 }),
];

export const updateClassStatusValidation = [
  param('id').isMongoId().withMessage('Invalid class ID'),
  body('status').notEmpty().withMessage('Status is required').isIn(Object.values(FINAL_CLASS_STATUS)).withMessage('Invalid class status'),
  body('actualEndDate').optional().isISO8601().withMessage('Invalid date format'),
];

export const updateProgressValidation = [
  param('id').isMongoId().withMessage('Invalid class ID'),
  body('completedSessions').notEmpty().withMessage('Completed sessions is required').isInt({ min: 0 }).withMessage('Completed sessions must be non-negative integer'),
];

export const classIdValidation = [param('id').isMongoId().withMessage('Invalid class ID')];

export const coordinatorIdParamValidation = [param('coordinatorId').isMongoId().withMessage('Invalid coordinator ID')];

export const tutorIdParamValidation = [param('tutorId').isMongoId().withMessage('Invalid tutor ID')];

export default {
  convertToFinalClassValidation,
  updateFinalClassValidation,
  updateClassStatusValidation,
  updateProgressValidation,
  classIdValidation,
  coordinatorIdParamValidation,
  tutorIdParamValidation,
};
