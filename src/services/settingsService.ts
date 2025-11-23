import UserPreferences, { IUserPreferencesDocument } from '../models/UserPreferences';
import ErrorResponse from '../utils/errorResponse';

const ALLOWED_UPDATE_FIELDS: (keyof Pick<
  IUserPreferencesDocument,
  'notificationPreferences' | 'themeMode' | 'language' | 'privacySettings'
>)[] = ['notificationPreferences', 'themeMode', 'language', 'privacySettings'];

export const getUserPreferences = async (userId: string) => {
  let prefs = await UserPreferences.findOne({ user: userId });

  if (!prefs) {
    prefs = new UserPreferences({ user: userId });
    await prefs.save();
  }

  return prefs;
};

export const updateUserPreferences = async (
  userId: string,
  updates: Partial<IUserPreferencesDocument>
) => {
  const invalidFields = Object.keys(updates || {}).filter(
    (key) => !ALLOWED_UPDATE_FIELDS.includes(key as any)
  );

  if (invalidFields.length > 0) {
    throw new ErrorResponse('Invalid preference fields provided', 400);
  }

  const updateData: Partial<IUserPreferencesDocument> = {};

  if (updates.notificationPreferences !== undefined) {
    updateData.notificationPreferences = updates.notificationPreferences;
  }
  if (updates.themeMode !== undefined) {
    updateData.themeMode = updates.themeMode;
  }
  if (updates.language !== undefined) {
    updateData.language = updates.language;
  }
  if (updates.privacySettings !== undefined) {
    updateData.privacySettings = updates.privacySettings as any;
  }

  const prefs = await UserPreferences.findOneAndUpdate(
    { user: userId },
    { $set: updateData },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (!prefs) {
    throw new ErrorResponse('Failed to update preferences', 500);
  }

  return prefs;
};

export const resetUserPreferences = async (userId: string) => {
  let prefs = await UserPreferences.findOne({ user: userId });

  if (!prefs) {
    prefs = new UserPreferences({ user: userId });
  }

  prefs.resetToDefaults();
  await prefs.save();

  return prefs;
};

export const deleteUserPreferences = async (userId: string) => {
  const deleted = await UserPreferences.findOneAndDelete({ user: userId });
  if (!deleted) {
    throw new ErrorResponse('Preferences not found', 404);
  }
  return { success: true };
};
