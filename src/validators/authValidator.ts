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
    .withMessage('Password is required'),
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

export const sendLoginOtpValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
];

export const verifyLoginOtpValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 4, max: 8 })
    .withMessage('OTP must be between 4 and 8 characters'),
];

export const parentLoginLookupValidation = [
  body('className')
    .trim()
    .notEmpty()
    .withMessage('Class name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Class name must be 2-100 characters'),
];

export const verifyChangePasswordOtpValidation = [
  body('otp').trim().notEmpty().withMessage('OTP is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required'),
];
