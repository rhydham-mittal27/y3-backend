import { body, param } from 'express-validator';
import { BOARD_TYPE, TEACHING_MODE, CLASS_LEAD_STATUS } from '../config/constants';

export const createLeadValidation = [
  body('studentName')
    .trim()
    .notEmpty()
    .withMessage('Student name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Student name must be 2-100 characters'),
  body('grade').trim().notEmpty().withMessage('Grade is required'),
  body('subject')
    .isArray({ min: 1 })
    .withMessage('At least one subject is required')
    .custom((arr) => Array.isArray(arr) && arr.every((s) => typeof s === 'string' && s.trim().length > 0)),
  body('board')
    .notEmpty()
    .withMessage('Board is required')
    .isIn(Object.values(BOARD_TYPE) as string[])
    .withMessage('Invalid board type'),
  body('mode')
    .notEmpty()
    .withMessage('Teaching mode is required')
    .isIn(Object.values(TEACHING_MODE) as string[])
    .withMessage('Invalid teaching mode'),
  body('location')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Location must be 2-200 characters'),
  body('timing')
    .trim()
    .notEmpty()
    .withMessage('Timing is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Timing must be 2-100 characters'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const updateLeadValidation = [
  param('id').isMongoId().withMessage('Invalid lead ID'),
  body('studentName').optional().trim().isLength({ min: 2, max: 100 }),
  body('grade').optional().trim().notEmpty(),
  body('subject').optional().isArray({ min: 1 }),
  body('board').optional().isIn(Object.values(BOARD_TYPE) as string[]),
  body('mode').optional().isIn(Object.values(TEACHING_MODE) as string[]),
  body('location').optional().trim(),
  body('timing').optional().trim().isLength({ min: 2, max: 100 }),
  body('notes').optional().trim().isLength({ max: 500 }),
];

export const updateStatusValidation = [
  param('id').isMongoId().withMessage('Invalid lead ID'),
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(Object.values(CLASS_LEAD_STATUS) as string[])
    .withMessage('Invalid status'),
];

export const leadIdValidation = [param('id').isMongoId().withMessage('Invalid lead ID')];

export default {
  createLeadValidation,
  updateLeadValidation,
  updateStatusValidation,
  leadIdValidation,
};
