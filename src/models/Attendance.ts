import mongoose, { Schema, Document, Model } from 'mongoose';
import { ATTENDANCE_STATUS } from '../config/constants';

export interface IAttendanceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  sessionDate: Date;
  sessionNumber?: number;
  tutor: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId;
  parent?: mongoose.Types.ObjectId;
  status: ATTENDANCE_STATUS | string;
  submittedBy: mongoose.Types.ObjectId;
  submittedAt: Date;
  coordinatorApprovedBy?: mongoose.Types.ObjectId;
  coordinatorApprovedAt?: Date;
  parentApprovedBy?: mongoose.Types.ObjectId;
  parentApprovedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema: Schema<IAttendanceDocument> = new Schema<IAttendanceDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    sessionDate: { type: Date, required: true },
    sessionNumber: { type: Number },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: Object.values(ATTENDANCE_STATUS), default: ATTENDANCE_STATUS.PENDING },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, default: Date.now },
    coordinatorApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    coordinatorApprovedAt: { type: Date },
    parentApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    parentApprovedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    notes: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// Indexes
AttendanceSchema.index({ finalClass: 1, sessionDate: -1 }, { unique: false });
AttendanceSchema.index({ status: 1 });
AttendanceSchema.index({ tutor: 1, status: 1 });
AttendanceSchema.index({ coordinator: 1, status: 1 });
AttendanceSchema.index({ parent: 1, status: 1 });
AttendanceSchema.index({ finalClass: 1, sessionDate: 1 }, { unique: true });

const Attendance: Model<IAttendanceDocument> =
  mongoose.models.Attendance || mongoose.model<IAttendanceDocument>('Attendance', AttendanceSchema);

export default Attendance;
