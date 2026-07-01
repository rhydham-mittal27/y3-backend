import { body, param } from 'express-validator';
import { TEST_STATUS, TEST_TYPE } from '../config/constants';

export const scheduleTestValidation = [
  body('finalClassId').notEmpty().withMessage('Final class ID is required').isMongoId().withMessage('Invalid final class ID'),
  body('testDate').notEmpty().withMessage('Test date is required').isISO8601().withMessage('Invalid date format'),
  body('testTime').notEmpty().withMessage('Test time is required').trim().isLength({ min: 3, max: 50 }).withMessage('Test time must be 3-50 characters'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
  body('testType').optional().isIn(Object.values(TEST_TYPE)).withMessage('Invalid test type'),
  body('coveredChapters').optional().isArray().withMessage('coveredChapters must be an array'),
  body('coveredChapters.*').optional().isMongoId().withMessage('Each chapter ID must be a valid Mongo ID'),
  body('topicName').optional().trim().isLength({ max: 255 }).withMessage('topicName max 255 chars'),
  body('testSyllabus').optional().trim().isLength({ max: 1000 }).withMessage('testSyllabus max 1000 chars'),
  body('totalMarks').optional().isFloat({ min: 1 }).withMessage('totalMarks must be > 0'),
  body('durationMinutes').optional().isInt({ min: 1 }).withMessage('durationMinutes must be > 0'),
];

export const updateTestValidation = [
  param('id').isMongoId().withMessage('Invalid test ID'),
  body('testDate').optional().isISO8601().withMessage('Invalid date format'),
  body('testTime').optional().trim().isLength({ min: 3, max: 50 }).withMessage('Test time must be 3-50 characters'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
];

export const submitTestReportValidation = [
  param('id').isMongoId().withMessage('Invalid test ID'),
  body('report').notEmpty().withMessage('Report is required').isObject().withMessage('Report must be an object'),
  body('report.feedback').notEmpty().withMessage('Feedback is required').trim().isLength({ min: 10, max: 2000 }).withMessage('Feedback must be 10-2000 characters'),
  body('report.strengths').notEmpty().withMessage('Strengths are required').trim().isLength({ min: 10, max: 1000 }).withMessage('Strengths must be 10-1000 characters'),
  body('report.areasOfImprovement').notEmpty().withMessage('Areas of improvement are required').trim().isLength({ min: 10, max: 1000 }).withMessage('Areas of improvement must be 10-1000 characters'),
  body('report.studentPerformance').notEmpty().withMessage('Student performance is required').trim().isLength({ min: 10, max: 1000 }).withMessage('Student performance must be 10-1000 characters'),
  body('report.recommendations').notEmpty().withMessage('Recommendations are required').trim().isLength({ min: 10, max: 1000 }).withMessage('Recommendations must be 10-1000 characters'),
  body('totalMarks').optional().isFloat({ min: 1 }).withMessage('totalMarks must be > 0'),
  body('obtainedMarks').optional().isFloat({ min: 0 }).withMessage('obtainedMarks must be >= 0'),
  body('coveredChapters').optional().isArray().withMessage('coveredChapters must be an array'),
  body('coveredChapters.*').optional().isMongoId().withMessage('Each chapter ID must be a valid Mongo ID'),
  body('questionAnalysis').optional().isArray().withMessage('questionAnalysis must be an array'),
];

export const updateTestStatusValidation = [
  param('id').isMongoId().withMessage('Invalid test ID'),
  body('status').notEmpty().withMessage('Status is required').isIn(Object.values(TEST_STATUS)).withMessage('Invalid test status'),
];

export const cancelTestValidation = [
  param('id').isMongoId().withMessage('Invalid test ID'),
  body('cancellationReason')
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Cancellation reason must be 5-500 characters'),
];

export const testIdValidation = [param('id').isMongoId().withMessage('Invalid test ID')];

export const classIdParamValidation = [param('classId').isMongoId().withMessage('Invalid class ID')];

export default {
  scheduleTestValidation,
  updateTestValidation,
  submitTestReportValidation,
  updateTestStatusValidation,
  cancelTestValidation,
  testIdValidation,
  classIdParamValidation,
};
