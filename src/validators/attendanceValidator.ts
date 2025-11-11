import { body, param } from 'express-validator';
import { ATTENDANCE_STATUS } from '../config/constants';

export const createAttendanceValidation = [
  body('finalClassId').notEmpty().withMessage('Final class ID is required').isMongoId().withMessage('Invalid final class ID'),
  body('sessionDate').notEmpty().withMessage('Session date is required').isISO8601().withMessage('Invalid date format'),
  body('sessionNumber').optional().isInt({ min: 1 }).withMessage('Session number must be positive integer'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
];

export const updateAttendanceValidation = [
  param('id').isMongoId().withMessage('Invalid attendance ID'),
  body('sessionDate').optional().isISO8601().withMessage('Invalid date format'),
  body('sessionNumber').optional().isInt({ min: 1 }).withMessage('Session number must be positive integer'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
];

export const rejectAttendanceValidation = [
  param('id').isMongoId().withMessage('Invalid attendance ID'),
  body('rejectionReason').notEmpty().withMessage('Rejection reason is required').trim().isLength({ min: 5, max: 500 }).withMessage('Rejection reason must be 5-500 characters'),
];

export const attendanceIdValidation = [param('id').isMongoId().withMessage('Invalid attendance ID')];

export const classIdParamValidation = [param('classId').isMongoId().withMessage('Invalid class ID')];

export default {
  createAttendanceValidation,
  updateAttendanceValidation,
  rejectAttendanceValidation,
  attendanceIdValidation,
  classIdParamValidation,
};
