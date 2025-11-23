import mongoose, { Schema, Document, Model } from 'mongoose';
import { NotificationType } from './Notification';

export interface IUserPreferencesDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  notificationPreferences: Record<NotificationType, boolean>;
  themeMode: 'light' | 'dark' | 'system';
  language: 'en' | 'hi' | 'es' | 'fr';
  privacySettings: {
    profileVisibility: 'public' | 'private' | 'contacts';
    showEmail: boolean;
    showPhone: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  resetToDefaults: () => IUserPreferencesDocument;
}

const UserPreferencesSchema: Schema<IUserPreferencesDocument> = new Schema<IUserPreferencesDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    notificationPreferences: {
      type: Object,
      default: {
        ANNOUNCEMENT: true,
        DEMO_ASSIGNED: true,
        PAYMENT: true,
        VERIFICATION: true,
        GENERAL: true,
        ATTENDANCE: true,
      },
    },
    themeMode: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'light',
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'es', 'fr'],
      default: 'en',
    },
    privacySettings: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'contacts'],
        default: 'public',
      },
      showEmail: {
        type: Boolean,
        default: false,
      },
      showPhone: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

UserPreferencesSchema.methods.resetToDefaults = function () {
  this.notificationPreferences = {
    ANNOUNCEMENT: true,
    DEMO_ASSIGNED: true,
    PAYMENT: true,
    VERIFICATION: true,
    GENERAL: true,
    ATTENDANCE: true,
  } as Record<NotificationType, boolean>;
  this.themeMode = 'light';
  this.language = 'en';
  this.privacySettings = {
    profileVisibility: 'public',
    showEmail: false,
    showPhone: false,
  };
  return this as IUserPreferencesDocument;
};

UserPreferencesSchema.index({ user: 1 });

const UserPreferences: Model<IUserPreferencesDocument> =
  mongoose.models.UserPreferences || mongoose.model<IUserPreferencesDocument>('UserPreferences', UserPreferencesSchema);

export default UserPreferences;
