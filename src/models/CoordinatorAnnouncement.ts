import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICoordinatorAnnouncementDocument extends Document {
  _id: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId;
  subject: string;
  message: string;
  recipientType: 'SPECIFIC_CLASS' | 'ALL_CLASSES' | 'SPECIFIC_TUTOR' | 'ALL_TUTORS' | 'STUDENTS_PARENTS';
  targetClass?: mongoose.Types.ObjectId;
  targetTutor?: mongoose.Types.ObjectId;
  recipients: mongoose.Types.ObjectId[];
  recipientCount: number;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CoordinatorAnnouncementSchema = new Schema<ICoordinatorAnnouncementDocument>(
  {
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, maxlength: 200, trim: true },
    message: { type: String, required: true, maxlength: 2000, trim: true },
    recipientType: {
      type: String,
      enum: ['SPECIFIC_CLASS', 'ALL_CLASSES', 'SPECIFIC_TUTOR', 'ALL_TUTORS', 'STUDENTS_PARENTS'],
      required: true,
    },
    targetClass: { type: Schema.Types.ObjectId, ref: 'FinalClass' },
    targetTutor: { type: Schema.Types.ObjectId, ref: 'User' },
    recipients: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    recipientCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CoordinatorAnnouncementSchema.index({ coordinator: 1, sentAt: -1 });
CoordinatorAnnouncementSchema.index({ recipientType: 1 });
CoordinatorAnnouncementSchema.index({ targetClass: 1 });

export default (mongoose.models.CoordinatorAnnouncement as Model<ICoordinatorAnnouncementDocument>) ||
  mongoose.model<ICoordinatorAnnouncementDocument>('CoordinatorAnnouncement', CoordinatorAnnouncementSchema);
