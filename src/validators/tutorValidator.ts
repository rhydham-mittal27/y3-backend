import { body, param } from 'express-validator';
import { VERIFICATION_STATUS, DOCUMENT_TYPES, TUTOR_TIER } from '../config/constants';

export const createTutorValidation = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),
  body('experienceHours').notEmpty().withMessage('Experience hours is required').isInt({ min: 0 }).withMessage('Experience hours must be non-negative integer'),
  body('subjects').notEmpty().withMessage('Subjects are required').isArray({ min: 1 }).withMessage('At least one subject is required'),
  body('subjects.*').trim().notEmpty().withMessage('Subject cannot be empty'),
  body('qualifications').optional().isArray(),
  body('qualifications.*').optional().trim().notEmpty(),
  body('preferredMode').optional().isIn(['ONLINE', 'OFFLINE', 'HYBRID']).withMessage('Invalid teaching mode'),
  body('preferredLocations').optional().isArray(),
  body('preferredLocations.*').optional().trim().notEmpty(),
];

export const updateTutorValidation = [
  param('id').isMongoId().withMessage('Invalid tutor ID'),
  body('experienceHours').optional().isInt({ min: 0 }),
  body('subjects').optional().isArray({ min: 1 }),
  body('subjects.*').optional().trim().notEmpty(),
  body('qualifications').optional().isArray(),
  body('qualifications.*').optional().trim().notEmpty(),
  body('preferredMode').optional().isIn(['ONLINE', 'OFFLINE', 'HYBRID']),
  body('preferredLocations').optional().isArray(),
  body('preferredLocations.*').optional().trim().notEmpty(),
  body('isAvailable').optional().isBoolean().withMessage('isAvailable must be boolean'),
];

export const uploadDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid tutor ID'),
  body('documentType').notEmpty().withMessage('Document type is required').isIn(DOCUMENT_TYPES as unknown as string[]).withMessage('Invalid document type'),
];

export const deleteDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid tutor ID'),
  param('documentIndex').isInt({ min: 0 }).withMessage('Invalid document index'),
];

export const updateVerificationStatusValidation = [
  param('id').isMongoId().withMessage('Invalid tutor ID'),
  body('status').notEmpty().withMessage('Status is required').isIn(Object.values(VERIFICATION_STATUS)).withMessage('Invalid verification status'),
  body('verificationNotes').optional().trim().isLength({ max: 1000 }).withMessage('Verification notes must not exceed 1000 characters'),
];

export const tutorIdValidation = [param('id').isMongoId().withMessage('Invalid tutor ID')];

export const userIdParamValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];

export const statusParamValidation = [param('status').isIn(Object.values(VERIFICATION_STATUS)).withMessage('Invalid verification status')];

export const requestTierChangeValidation = [
  body('tutorId').notEmpty().withMessage('Tutor ID is required').isMongoId().withMessage('Invalid tutor ID'),
  body('newTier').notEmpty().withMessage('New tier is required').isIn(Object.values(TUTOR_TIER)).withMessage('Invalid tier value'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),
];

export const approveTierChangeValidation = [
  param('tutorId').isMongoId().withMessage('Invalid tutor ID'),
  body('approve').notEmpty().withMessage('Approval decision is required').isBoolean().withMessage('Approve must be boolean'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const submitTutorFeedbackValidation = [
  body('tutorId').notEmpty().withMessage('Tutor ID is required').isMongoId().withMessage('Invalid tutor ID'),
  body('finalClassId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid class ID'),
  body('submitterRole').notEmpty().withMessage('Submitter role is required').isIn(['PARENT', 'STUDENT']).withMessage('Invalid submitter role'),
  body('month').notEmpty().withMessage('Month is required').matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format'),
  body('ratings').notEmpty().withMessage('Ratings are required').isObject().withMessage('Ratings must be an object'),
  body('ratings.overallRating').notEmpty().withMessage('Overall rating is required').isInt({ min: 1, max: 5 }).withMessage('Overall rating must be 1-5'),
  body('ratings.teachingQuality').notEmpty().withMessage('Teaching quality rating is required').isInt({ min: 1, max: 5 }).withMessage('Teaching quality must be 1-5'),
  body('ratings.punctuality').notEmpty().withMessage('Punctuality rating is required').isInt({ min: 1, max: 5 }).withMessage('Punctuality must be 1-5'),
  body('ratings.communication').notEmpty().withMessage('Communication rating is required').isInt({ min: 1, max: 5 }).withMessage('Communication must be 1-5'),
  body('ratings.subjectKnowledge').notEmpty().withMessage('Subject knowledge rating is required').isInt({ min: 1, max: 5 }).withMessage('Subject knowledge must be 1-5'),
  body('comments').optional().trim().isLength({ max: 1000 }).withMessage('Comments must not exceed 1000 characters'),
  body('strengths').optional().trim().isLength({ max: 500 }).withMessage('Strengths must not exceed 500 characters'),
  body('improvements').optional().trim().isLength({ max: 500 }).withMessage('Improvements must not exceed 500 characters'),
  body('wouldRecommend').notEmpty().withMessage('Recommendation is required').isBoolean().withMessage('Would recommend must be boolean'),
];

export const tutorIdParamValidation = [param('tutorId').isMongoId().withMessage('Invalid tutor ID')];
