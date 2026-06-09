import { body } from 'express-validator';

export const createParentLeadValidation = [
  body('parentName')
    .trim()
    .notEmpty()
    .withMessage('Parent name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Parent name must be 2–100 characters'),

  body('parentEmail')
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please enter a valid email address'),

  body('parentPhone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\d{10}$/)
    .withMessage('Phone number must be exactly 10 digits'),

  body('studentName')
    .trim()
    .notEmpty()
    .withMessage('Student name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Student name must be 2–100 characters'),

  body('studentGrade')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Grade must be at most 20 characters'),

  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be at most 100 characters'),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
];

export default { createParentLeadValidation };
