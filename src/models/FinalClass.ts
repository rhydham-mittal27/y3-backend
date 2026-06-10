import mongoose, { Schema, Model } from 'mongoose';
import { FINAL_CLASS_STATUS } from '../config/constants';
import { softDeletePlugin, SoftDeleteDocument } from '../utils/softDelete.plugin';

export interface ITutorHistory {
  tutor: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  reason?: string;
  replacedBy?: mongoose.Types.ObjectId;
}

export interface IFinalClassDocument extends SoftDeleteDocument {
  _id: mongoose.Types.ObjectId;
  className: string;
  classLead: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  coordinator?: mongoose.Types.ObjectId;
  parent?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  actualEndDate?: Date;
  status: FINAL_CLASS_STATUS;
  tutorHistory?: ITutorHistory[];
  schedule?: {
    startDate?: Date;
    daysOfWeek?: string[];
    timeSlot?: string;
  };
  totalSessions: number;
  classesPerMonth?: number;
  ratePerSession?: number;
  tutorRatePerSession?: number;
  completedSessions: number;
  studentName: string;
  studentGender?: 'M' | 'F';
  studentId?: string;
  subject: mongoose.Types.ObjectId[];
  grade: string;
  board: string;
  mode: string;
  location?: string;
  convertedBy: mongoose.Types.ObjectId;
  convertedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  progressPercentage?: number;
  oneTimeReschedules?: { fromDate: Date; toDate: Date; timeSlot: string }[];
  testPerMonth?: number;
  attendanceSubmissionWindow?: number;
  monthlyFees?: number;
  tutorMonthlyFees?: number;
  sheetCount?: number;
  cycleStartPending?: boolean;
  currentCycleNumber?: number;
}

const FinalClassSchema: Schema<IFinalClassDocument> = new Schema<IFinalClassDocument>(
  {
    className: { type: String, required: true, unique: true },
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead', required: true, unique: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User' },
    parent: { type: Schema.Types.ObjectId, ref: 'User' },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    actualEndDate: { type: Date },
    status: { type: String, enum: Object.values(FINAL_CLASS_STATUS), default: FINAL_CLASS_STATUS.ACTIVE },
    schedule: {
      startDate: { type: Date },
      daysOfWeek: { type: [String] },
      timeSlot: { type: String },
    },
    totalSessions: { type: Number, default: 0 },
    classesPerMonth: { type: Number, min: 0 },
    ratePerSession: { type: Number, min: 0 },
    tutorRatePerSession: { type: Number, min: 0 },
    completedSessions: { type: Number, default: 0 },
    studentName: { type: String, required: true },
    studentGender: { type: String, enum: ['M', 'F'] },
    studentId: { type: String, unique: true, sparse: true },
    subject: { type: [{ type: Schema.Types.ObjectId, ref: 'Option' }], required: true },
    grade: { type: String, required: true },
    board: { type: String, required: true },
    mode: { type: String, required: true },
    location: { type: String },
    convertedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    convertedAt: { type: Date, default: Date.now },
    notes: { type: String },
    testPerMonth: { type: Number, default: 1, min: 0 },
    attendanceSubmissionWindow: { type: Number, default: 2, min: 0 },
    monthlyFees: { type: Number, min: 0 },
    tutorMonthlyFees: { type: Number, min: 0 },
    oneTimeReschedules: [
      {
        fromDate: { type: Date, required: true },
        toDate: { type: Date, required: true },
        timeSlot: { type: String, required: true },
      },
    ],
    cycleStartPending: { type: Boolean, default: false },
    currentCycleNumber: { type: Number, default: 1, min: 1 },
    tutorHistory: [
      {
        tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reason: { type: String },
        replacedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes
FinalClassSchema.index({ status: 1, startDate: 1 });
FinalClassSchema.index({ tutor: 1 });
FinalClassSchema.index({ tutor: 1, status: 1 });        // dashboard: per-tutor active classes
FinalClassSchema.index({ coordinator: 1 });
FinalClassSchema.index({ coordinator: 1, status: 1 });
FinalClassSchema.index({ convertedBy: 1 });              // dashboard: manager filtering
FinalClassSchema.index({ convertedBy: 1, status: 1 });  // dashboard: active classes by manager
FinalClassSchema.index({ convertedAt: -1 });             // dashboard: date-range queries
FinalClassSchema.index({ status: 1, convertedAt: -1 }); // dashboard: cumulative growth chart


// Virtuals
FinalClassSchema.virtual('progressPercentage').get(function (this: IFinalClassDocument) {
  const total = this.classesPerMonth || this.totalSessions || 0;
  const done = this.completedSessions || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (done / total) * 100));
});

FinalClassSchema.pre('validate', function (next) {
  const doc = this as IFinalClassDocument & { oneTimeReschedules?: any[] };
  if (Array.isArray(doc.oneTimeReschedules)) {
    doc.oneTimeReschedules = doc.oneTimeReschedules.filter(
      (r: any) => r && r.fromDate && r.toDate && r.timeSlot
    );
  }
  next();
});

FinalClassSchema.plugin(softDeletePlugin);

const FinalClass: Model<IFinalClassDocument> =
  mongoose.models.FinalClass || mongoose.model<IFinalClassDocument>('FinalClass', FinalClassSchema);

export default FinalClass;
