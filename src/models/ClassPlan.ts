import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IClassPlanDocument extends Document {
  classId: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId; // Optional, as it might be redundant with class.parent, but good for explicit history tracking if needed
  currentTutorId?: mongoose.Types.ObjectId; // Track who the tutor was when this plan was active
  monthlyFee: number;
  tutorMonthlyFee: number;
  sessionsPerMonth: number;
  perSessionFee: number;
  tutorPerSessionFee: number;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

const ClassPlanSchema: Schema<IClassPlanDocument> = new Schema<IClassPlanDocument>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'User' },
    currentTutorId: { type: Schema.Types.ObjectId, ref: 'User' },
    monthlyFee: { type: Number, required: true, min: 0 },
    tutorMonthlyFee: { type: Number, required: true, min: 0, default: 0 },
    sessionsPerMonth: { type: Number, required: true, min: 1 },
    perSessionFee: { type: Number, required: true },
    tutorPerSessionFee: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], default: 'ACTIVE', index: true },
  },
  { timestamps: true }
);

// Middleware to calculate perSessionFee before validation
ClassPlanSchema.pre('validate', function (next) {
  const doc = this as IClassPlanDocument;
  if (doc.sessionsPerMonth && doc.sessionsPerMonth > 0) {
    if (doc.monthlyFee !== undefined) {
      doc.perSessionFee = doc.monthlyFee / doc.sessionsPerMonth;
    }
    if (doc.tutorMonthlyFee !== undefined) {
      doc.tutorPerSessionFee = doc.tutorMonthlyFee / doc.sessionsPerMonth;
    }
  }
  next();
});

const ClassPlan: Model<IClassPlanDocument> =
  mongoose.models.ClassPlan || mongoose.model<IClassPlanDocument>('ClassPlan', ClassPlanSchema);

export default ClassPlan;
