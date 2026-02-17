import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IClassPlanDocument extends Document {
  classId: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId; // Optional, as it might be redundant with class.parent, but good for explicit history tracking if needed
  currentTutorId?: mongoose.Types.ObjectId; // Track who the tutor was when this plan was active
  monthlyFee: number;
  sessionsPerMonth: number;
  perSessionFee: number;
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
    sessionsPerMonth: { type: Number, required: true, min: 1 },
    perSessionFee: { type: Number, required: true },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], default: 'ACTIVE', index: true },
  },
  { timestamps: true }
);

// Middleware to calculate perSessionFee before validation
ClassPlanSchema.pre('validate', function (next) {
  const doc = this as IClassPlanDocument;
  if (doc.monthlyFee !== undefined && doc.sessionsPerMonth) {
    doc.perSessionFee = doc.monthlyFee / doc.sessionsPerMonth;
  }
  next();
});

const ClassPlan: Model<IClassPlanDocument> =
  mongoose.models.ClassPlan || mongoose.model<IClassPlanDocument>('ClassPlan', ClassPlanSchema);

export default ClassPlan;
