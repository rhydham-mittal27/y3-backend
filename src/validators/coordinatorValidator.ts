import { body, param, query } from 'express-validator';
import { FINAL_CLASS_STATUS } from '../config/constants';

export const createCoordinatorValidation = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),
  body('specialization').optional().isArray().withMessage('Specialization must be an array'),
  body('specialization.*').optional().trim().notEmpty().withMessage('Specialization items cannot be empty'),
  body('maxClassCapacity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max class capacity must be between 1 and 100'),
];

export const updateCoordinatorValidation = [
  param('id').isMongoId().withMessage('Invalid coordinator ID'),
  body('specialization').optional().isArray(),
  body('specialization.*').optional().trim().notEmpty(),
  body('maxClassCapacity').optional().isInt({ min: 1, max: 100 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const coordinatorIdValidation = [param('id').isMongoId().withMessage('Invalid coordinator ID')];

export const userIdParamValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];

export const assignedClassesQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(Object.values(FINAL_CLASS_STATUS) as string[])
    .withMessage('Invalid status value'),
  query('subject').optional().isString().trim(),
  query('grade').optional().isString().trim(),
  query('sortBy')
    .optional()
    .isIn(['startDate', 'studentName', 'completedSessions', 'status'])
    .withMessage('Invalid sortBy field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

export default {
  createCoordinatorValidation,
  updateCoordinatorValidation,
  coordinatorIdValidation,
  userIdParamValidation,
  assignedClassesQueryValidation,
};
