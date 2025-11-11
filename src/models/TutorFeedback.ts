import mongoose, { Schema, Document, Model } from 'mongoose';
import { FEEDBACK_RATING } from '../config/constants';

export interface ITutorFeedbackDocument extends Document {
  _id: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  submittedBy: mongoose.Types.ObjectId;
  submitterRole: 'PARENT' | 'STUDENT';
  month: string;
  overallRating: number;
  teachingQuality: number;
  punctuality: number;
  communication: number;
  subjectKnowledge: number;
  comments?: string;
  strengths?: string;
  improvements?: string;
  wouldRecommend: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TutorFeedbackSchema: Schema<ITutorFeedbackDocument> = new Schema<ITutorFeedbackDocument>(
  {
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submitterRole: { type: String, enum: ['PARENT', 'STUDENT'], required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    overallRating: { type: Number, required: true, min: 1, max: 5 },
    teachingQuality: { type: Number, required: true, min: 1, max: 5 },
    punctuality: { type: Number, required: true, min: 1, max: 5 },
    communication: { type: Number, required: true, min: 1, max: 5 },
    subjectKnowledge: { type: Number, required: true, min: 1, max: 5 },
    comments: { type: String, maxlength: 1000 },
    strengths: { type: String, maxlength: 500 },
    improvements: { type: String, maxlength: 500 },
    wouldRecommend: { type: Boolean, required: true },
  },
  { timestamps: true }
);

TutorFeedbackSchema.index({ tutor: 1, month: -1 });
TutorFeedbackSchema.index({ finalClass: 1, month: 1 });
TutorFeedbackSchema.index({ tutor: 1, finalClass: 1, month: 1, submittedBy: 1 }, { unique: true });

const TutorFeedback: Model<ITutorFeedbackDocument> =
  mongoose.models.TutorFeedback || mongoose.model<ITutorFeedbackDocument>('TutorFeedback', TutorFeedbackSchema);

export default TutorFeedback;
