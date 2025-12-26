import { body } from 'express-validator';
import { BOARD_TYPE, TEACHING_MODE } from '../config/constants';

export const createPublicParentLeadValidation = [
  body('studentName')
    .trim()
    .notEmpty()
    .withMessage('Student name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Student name must be 2-100 characters'),
  body('studentGender')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Student gender must be M or F'),
  body('parentName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Parent name must be 2-100 characters'),
  body('parentEmail')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Parent email must be a valid email address'),
  body('parentPhone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 7, max: 20 })
    .withMessage('Parent phone must be 7-20 characters'),
  body('grade')
    .trim()
    .notEmpty()
    .withMessage('Grade is required'),
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
  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be 2-100 characters'),
  body('area')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Area must be 2-100 characters'),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be 5-200 characters'),
  body('timing')
    .trim()
    .notEmpty()
    .withMessage('Preferred timing is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Timing must be 2-100 characters'),
  body('preferredTutorGender')
    .optional({ checkFalsy: true })
    .isString(),
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
];

export default {
  createPublicParentLeadValidation,
};
