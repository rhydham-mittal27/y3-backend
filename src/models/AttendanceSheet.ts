import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendanceSheetDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId;
  month: number; // 1-12
  year: number; // e.g. 2025
  periodLabel?: string; // e.g. "Jan 2025"
  attendanceIds: mongoose.Types.ObjectId[]; // Attendance records included in this sheet
  totalSessionsPlanned?: number;
  totalSessionsTaken?: number;
  presentCount?: number;
  absentCount?: number;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  submittedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
}

const AttendanceSheetSchema: Schema<IAttendanceSheetDocument> = new Schema<IAttendanceSheetDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    periodLabel: { type: String },
    attendanceIds: [{ type: Schema.Types.ObjectId, ref: 'Attendance', required: true }],
    totalSessionsPlanned: { type: Number, default: 0 },
    totalSessionsTaken: { type: Number, default: 0 },
    presentCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'DRAFT',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

AttendanceSheetSchema.index({ finalClass: 1, month: 1, year: 1 }, { unique: true });
AttendanceSheetSchema.index({ coordinator: 1, status: 1 });

const AttendanceSheet: Model<IAttendanceSheetDocument> =
  mongoose.models.AttendanceSheet || mongoose.model<IAttendanceSheetDocument>('AttendanceSheet', AttendanceSheetSchema);

export default AttendanceSheet;
