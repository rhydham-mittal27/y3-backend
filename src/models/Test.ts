import mongoose, { Schema, Document, Model } from 'mongoose';
import { TEST_STATUS, TEST_TYPE } from '../config/constants';
import { getS3PublicUrlForKey } from '../config/s3';

export interface ITestDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId;
  testDate: Date;
  testTime: string;
  status: TEST_STATUS | string;
  cycleNumber: number;
  testType?: TEST_TYPE | string;
  coveredChapters?: mongoose.Types.ObjectId[];
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
  paperUrl?: string;
  paperName?: string;
  paperMimeType?: string;
  paperS3Key?: string;
  totalMarks?: number;
  durationMinutes?: number;
  obtainedMarks?: number;
  topicName?: string;
  testSyllabus?: string;
  questionAnalysis?: Array<{
    topic: string;
    totalQuestions: number;
    correctedQuestions: number;
  }>;
  answerSheetUrl?: string;
  answerSheetName?: string;
  answerSheetMimeType?: string;
  answerSheetS3Key?: string;
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
    cycleNumber: { type: Number, required: true, default: 1, min: 1 },
    testType: { type: String, enum: Object.values(TEST_TYPE) },
    coveredChapters: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
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
    paperUrl: { type: String },
    paperName: { type: String },
    paperMimeType: { type: String },
    paperS3Key: { type: String },
    totalMarks: { type: Number },
    durationMinutes: { type: Number },
    obtainedMarks: { type: Number },
    topicName: { type: String, maxlength: 255 },
    testSyllabus: { type: String, maxlength: 1000 },
    questionAnalysis: {
      type: [
        {
          topic: { type: String, required: true },
          totalQuestions: { type: Number, required: true },
          correctedQuestions: { type: Number, required: true },
        },
      ],
      default: [],
    },
    answerSheetUrl: { type: String },
    answerSheetName: { type: String },
    answerSheetMimeType: { type: String },
    answerSheetS3Key: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        if (typeof ret?.paperUrl === 'string' && ret.paperUrl.length > 0 && !/^https?:\/\//i.test(ret.paperUrl)) {
          ret.paperUrl = getS3PublicUrlForKey(ret.paperUrl);
        }
        if (typeof ret?.answerSheetUrl === 'string' && ret.answerSheetUrl.length > 0 && !/^https?:\/\//i.test(ret.answerSheetUrl)) {
          ret.answerSheetUrl = getS3PublicUrlForKey(ret.answerSheetUrl);
        }
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: any) => {
        if (typeof ret?.paperUrl === 'string' && ret.paperUrl.length > 0 && !/^https?:\/\//i.test(ret.paperUrl)) {
          ret.paperUrl = getS3PublicUrlForKey(ret.paperUrl);
        }
        if (typeof ret?.answerSheetUrl === 'string' && ret.answerSheetUrl.length > 0 && !/^https?:\/\//i.test(ret.answerSheetUrl)) {
          ret.answerSheetUrl = getS3PublicUrlForKey(ret.answerSheetUrl);
        }
        return ret;
      },
    },
  }
);

// Indexes
TestSchema.index({ finalClass: 1, testDate: -1 });
TestSchema.index({ status: 1 });
TestSchema.index({ tutor: 1, status: 1 });
TestSchema.index({ coordinator: 1, status: 1 });
TestSchema.index({ testDate: 1 });

const Test: Model<ITestDocument> = mongoose.models.Test || mongoose.model<ITestDocument>('Test', TestSchema);

export default Test;
