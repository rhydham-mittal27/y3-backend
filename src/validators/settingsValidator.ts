import { body } from 'express-validator';

export const updatePreferencesValidation = [
  body('notificationPreferences').optional().isObject().withMessage('notificationPreferences must be an object'),
  body('notificationPreferences.ANNOUNCEMENT').optional().isBoolean(),
  body('notificationPreferences.DEMO_ASSIGNED').optional().isBoolean(),
  body('notificationPreferences.PAYMENT').optional().isBoolean(),
  body('notificationPreferences.VERIFICATION').optional().isBoolean(),
  body('notificationPreferences.GENERAL').optional().isBoolean(),
  body('notificationPreferences.ATTENDANCE').optional().isBoolean(),
  body('themeMode').optional().isIn(['light', 'dark', 'system']),
  body('language').optional().isIn(['en', 'hi', 'es', 'fr']),
  body('privacySettings').optional().isObject().withMessage('privacySettings must be an object'),
  body('privacySettings.profileVisibility')
    .optional()
    .isIn(['public', 'private', 'contacts'])
    .withMessage('Invalid profile visibility value'),
  body('privacySettings.showEmail').optional().isBoolean(),
  body('privacySettings.showPhone').optional().isBoolean(),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];
