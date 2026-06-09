import { body } from 'express-validator';

export const registerParentValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),

  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('City must be at most 100 characters'),

  body('primaryStudentName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Student name must be 2–100 characters'),

  body('primaryStudentGrade')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Grade must be at most 20 characters'),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];
