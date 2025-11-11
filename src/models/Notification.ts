import mongoose, { Schema, Document, Model } from 'mongoose';

export type NotificationType = 'ANNOUNCEMENT' | 'DEMO_ASSIGNED' | 'PAYMENT' | 'VERIFICATION' | 'GENERAL' | 'ATTENDANCE';

export interface INotificationDocument extends Document {
  _id: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedAnnouncement?: mongoose.Types.ObjectId | null;
  relatedClassLead?: mongoose.Types.ObjectId | null;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  markAsRead: () => Promise<INotificationDocument>;
}

const NotificationSchema: Schema<INotificationDocument> = new Schema<INotificationDocument>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['ANNOUNCEMENT', 'DEMO_ASSIGNED', 'PAYMENT', 'VERIFICATION', 'GENERAL', 'ATTENDANCE'], required: true },
    title: { type: String, required: true, maxlength: 200, trim: true },
    message: { type: String, required: true, maxlength: 1000, trim: true },
    relatedAnnouncement: { type: Schema.Types.ObjectId, ref: 'Announcement' },
    relatedClassLead: { type: Schema.Types.ObjectId, ref: 'ClassLead' },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.methods.markAsRead = async function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this as INotificationDocument;
};

// Indexes
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ relatedAnnouncement: 1 });
NotificationSchema.index({ type: 1 });

const Notification: Model<INotificationDocument> =
  mongoose.models.Notification || mongoose.model<INotificationDocument>('Notification', NotificationSchema);

export default Notification;
