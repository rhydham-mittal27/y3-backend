import { param } from 'express-validator';

export const notificationIdValidation = [param('id').isMongoId().withMessage('Invalid notification ID')];
