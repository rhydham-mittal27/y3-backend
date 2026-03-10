import { body, param } from 'express-validator';
import { TEACHING_MODE, CLASS_LEAD_STATUS } from '../config/constants';

export const createLeadValidation = [
  body('studentType')
    .notEmpty()
    .withMessage('Student type is required')
    .isIn(['SINGLE', 'GROUP'])
    .withMessage('Student type must be either SINGLE or GROUP'),
  
  // Conditional validation for studentName - only required for single student
  body('studentName')
    .if(body('studentType').equals('SINGLE'))
    .trim()
    .notEmpty()
    .withMessage('Student name is required for single student')
    .isLength({ min: 2, max: 100 })
    .withMessage('Student name must be 2-100 characters'),
  
  body('parentEmail').optional({ checkFalsy: true }).isEmail().withMessage('Parent email must be a valid email address'),
  body('parentPhone').optional().trim().isLength({ min: 7, max: 20 }).withMessage('Parent phone must be 7-20 characters'),
  
  // Grade and subjects are required for both single and group
  body('grade').trim().notEmpty().withMessage('Grade is required'),
  body('subject')
    .isArray({ min: 1 })
    .withMessage('At least one subject is required')
    .custom((arr) => Array.isArray(arr) && arr.every((s) => typeof s === 'string' && s.trim().length > 0)),
  
  body('board')
    .notEmpty()
    .withMessage('Board is required')
    .isString()
    .trim(),
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
    .withMessage('Timing is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Timing must be 2-100 characters'),
  body('weekdays')
    .optional()
    .isArray()
    .withMessage('Weekdays must be an array')
    .custom((arr) => Array.isArray(arr) && arr.every((d) => typeof d === 'string' && d.trim().length > 0)),
  body('classesPerMonth').optional().isInt({ min: 1 }).withMessage('Classes per month must be a positive integer'),
  body('classDurationHours').optional().isFloat({ min: 0.5 }).withMessage('Class duration must be at least 0.5 hours'),
  
  // Conditional validation for paymentAmount and tutorFees - only for single student
  body('paymentAmount')
    .if(body('studentType').equals('SINGLE'))
    .isFloat({ min: 0 })
    .withMessage('Fees must be a non-negative number'),
  body('tutorFees')
    .if(body('studentType').equals('SINGLE'))
    .isFloat({ min: 0 })
    .withMessage('Tutor fees must be a non-negative number'),
  
  // Group specific validations
  body('numberOfStudents')
    .if(body('studentType').equals('GROUP'))
    .isInt({ min: 1, max: 10 })
    .withMessage('Number of students must be between 1 and 10'),
  
  body('studentDetails')
    .if(body('studentType').equals('GROUP'))
    .isArray({ min: 1 })
    .withMessage('Student details are required for group'),
  
  // Validate each student in the group
  body('studentDetails.*.name')
    .if(body('studentType').equals('GROUP'))
    .trim()
    .notEmpty()
    .withMessage('Student name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Student name must be 2-100 characters'),
  
  body('studentDetails.*.fees')
    .if(body('studentType').equals('GROUP'))
    .isFloat({ min: 0 })
    .withMessage('Student fees must be a non-negative number'),
  
  body('studentDetails.*.tutorFees')
    .if(body('studentType').equals('GROUP'))
    .isFloat({ min: 0 })
    .withMessage('Student tutor fees must be a non-negative number'),
  
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
  body('internalNotes').optional().trim().isLength({ max: 2000 }).withMessage('Internal notes must not exceed 2000 characters'),
];

export const updateLeadValidation = [
  param('id').isMongoId().withMessage('Invalid lead ID'),
  body('studentName').optional().trim().isLength({ min: 2, max: 100 }),
  body('parentEmail').optional({ checkFalsy: true }).isEmail(),
  body('parentPhone').optional().trim().isLength({ min: 7, max: 20 }),
  body('grade').optional().trim().notEmpty(),
  body('subject').optional().isArray({ min: 1 }),
  body('board').optional().isString().trim(),
  body('mode').optional().isIn(Object.values(TEACHING_MODE) as string[]),
  body('location').optional().trim(),
  body('city').optional().trim(),
  body('area').optional().trim(),
  body('address').optional().trim(),
  body('timing').optional().trim().isLength({ min: 2, max: 100 }),
  body('weekdays').optional().isArray(),
  body('classesPerMonth').optional().isInt({ min: 1 }),
  body('classDurationHours').optional().isFloat({ min: 0.5 }),
  body('paymentAmount').optional().isFloat({ min: 0 }),
  body('tutorFees').optional().isFloat({ min: 0 }),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('internalNotes').optional().trim().isLength({ max: 2000 }),
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
