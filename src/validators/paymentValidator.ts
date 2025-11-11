import { body, param } from 'express-validator';
import { PAYMENT_STATUS, PAYMENT_METHOD } from '../config/constants';

export const createPaymentValidation = [
  body('attendanceId').notEmpty().withMessage('Attendance ID is required').isMongoId().withMessage('Invalid attendance ID'),
];

export const updatePaymentStatusValidation = [
  param('id').isMongoId().withMessage('Invalid payment ID'),
  body('status').notEmpty().withMessage('Status is required').isIn(Object.values(PAYMENT_STATUS)).withMessage('Invalid payment status'),
  body('paymentMethod').optional().isIn(Object.values(PAYMENT_METHOD)).withMessage('Invalid payment method'),
  body('transactionId').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Transaction ID must be 3-100 characters'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const updatePaymentValidation = [
  param('id').isMongoId().withMessage('Invalid payment ID'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be non-negative'),
  body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const paymentIdValidation = [param('id').isMongoId().withMessage('Invalid payment ID')];
export const tutorIdParamValidation = [param('tutorId').isMongoId().withMessage('Invalid tutor ID')];
export const classIdParamValidation = [param('classId').isMongoId().withMessage('Invalid class ID')];

export const sendPaymentReminderValidation = [
  param('id').isMongoId().withMessage('Invalid payment ID'),
  body('reminderMessage')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reminder message must be 10-500 characters'),
];

export default {
  createPaymentValidation,
  updatePaymentStatusValidation,
  updatePaymentValidation,
  paymentIdValidation,
  tutorIdParamValidation,
  classIdParamValidation,
  sendPaymentReminderValidation,
};
