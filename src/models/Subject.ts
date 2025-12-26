import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubjectDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  code?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema: Schema<ISubjectDocument> = new Schema<ISubjectDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, trim: true, unique: true, sparse: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ isActive: 1, name: 1 });

const Subject: Model<ISubjectDocument> =
  mongoose.models.Subject || mongoose.model<ISubjectDocument>('Subject', SubjectSchema);

export default Subject;
