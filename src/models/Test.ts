import mongoose, { Schema, Document, Model } from 'mongoose';
import { TEST_STATUS } from '../config/constants';

export interface ITestDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId;
  testDate: Date;
  testTime: string;
  status: TEST_STATUS | string;
  scheduledBy: mongoose.Types.ObjectId;
  scheduledAt: Date;
  completedAt?: Date;
  report?: {
    feedback: string;
    strengths: string;
    areasOfImprovement: string;
    studentPerformance: string;
    recommendations: string;
  };
  reportSubmittedBy?: mongoose.Types.ObjectId;
  reportSubmittedAt?: Date;
  cancellationReason?: string;
  cancelledBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TestSchema: Schema<ITestDocument> = new Schema<ITestDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    testDate: { type: Date, required: true },
    testTime: { type: String, required: true },
    status: { type: String, enum: Object.values(TEST_STATUS), default: TEST_STATUS.SCHEDULED },
    scheduledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    report: {
      type: {
        feedback: { type: String },
        strengths: { type: String },
        areasOfImprovement: { type: String },
        studentPerformance: { type: String },
        recommendations: { type: String },
      },
    },
    reportSubmittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reportSubmittedAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    notes: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// Indexes
TestSchema.index({ finalClass: 1, testDate: -1 });
TestSchema.index({ status: 1 });
TestSchema.index({ tutor: 1, status: 1 });
TestSchema.index({ coordinator: 1, status: 1 });
TestSchema.index({ testDate: 1 });

const Test: Model<ITestDocument> = mongoose.models.Test || mongoose.model<ITestDocument>('Test', TestSchema);

export default Test;
