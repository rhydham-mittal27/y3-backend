import { body } from 'express-validator';

export const createFolderValidation = [
  body('name').trim().notEmpty().withMessage('Folder name is required').isLength({ min: 1, max: 100 }).withMessage('Folder name must be 1-100 characters'),
  body('parentId').optional().isMongoId().withMessage('Invalid parentId'),
  body('grade').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Grade must be 1-50 characters'),
];

export const uploadNoteFileValidation = [
  body('parentId').optional().isMongoId().withMessage('Invalid parentId'),
  body('grade').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Grade must be 1-50 characters'),
];
