import { body, param } from 'express-validator';

export const postAnnouncementValidation = [
  body('classLeadId').notEmpty().withMessage('Class lead ID is required').isMongoId().withMessage('Invalid class lead ID'),
];

export const expressInterestValidation = [
  param('id').isMongoId().withMessage('Invalid announcement ID'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters'),
];

export const announcementIdValidation = [param('id').isMongoId().withMessage('Invalid announcement ID')];

export const leadIdValidation = [param('leadId').isMongoId().withMessage('Invalid lead ID')];

export const sendCoordinatorAnnouncementValidation = [
  body('subject')
    .notEmpty()
    .withMessage('Subject is required')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Subject must be 3-200 characters'),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be 10-2000 characters'),
  body('recipientType')
    .notEmpty()
    .withMessage('Recipient type is required')
    .isIn(['SPECIFIC_CLASS', 'ALL_CLASSES', 'SPECIFIC_TUTOR', 'ALL_TUTORS', 'STUDENTS_PARENTS'])
    .withMessage('Invalid recipient type'),
  body('targetClassId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid class ID'),
  body('targetTutorId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid tutor ID'),
];

export const coordinatorAnnouncementIdValidation = [param('id').isMongoId().withMessage('Invalid announcement ID')];
