import { body } from 'express-validator';
import { USER_ROLES } from '../config/constants';

export const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES) as string[])
    .withMessage('Invalid role'),
];

export const loginValidation = [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

export const refreshTokenValidation = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
];
