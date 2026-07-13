import { body, param } from 'express-validator';

export const groupClassIdValidation = [param('id').isMongoId().withMessage('Invalid group class ID')];

export const renewGroupClassValidation = [
  param('id').isMongoId().withMessage('Invalid group class ID'),
  body('attendanceSheetId').optional().isMongoId().withMessage('Invalid attendance sheet ID'),
  body('sessionsPerMonth').optional().isInt({ min: 1 }).withMessage('Sessions per month must be a positive integer'),
  body('tutorRatePerSession').optional().isFloat({ min: 0 }).withMessage('Tutor rate per session must be non-negative'),
];

export default {
  groupClassIdValidation,
  renewGroupClassValidation,
};
