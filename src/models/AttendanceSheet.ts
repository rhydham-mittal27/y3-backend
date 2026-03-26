import mongoose, { Schema, Document, Model } from 'mongoose';
import { STUDENT_ATTENDANCE_STATUS, ATTENDANCE_STATUS } from '../config/constants';

export interface IStudentAttendance {
  student: mongoose.Types.ObjectId;
  enrollment: mongoose.Types.ObjectId;
  status: STUDENT_ATTENDANCE_STATUS;
  notes?: string;
}

export interface IDailyAttendanceRecord {
  _id?: mongoose.Types.ObjectId;
  sessionDate: Date;
  durationHours: number;
  topicCovered?: string;
  studentAttendanceStatus: STUDENT_ATTENDANCE_STATUS; // Kept for backward compatibility / single student
  studentAttendances?: IStudentAttendance[]; // For Group Classes
  status: ATTENDANCE_STATUS;
  notes?: string;
  submittedBy: mongoose.Types.ObjectId;
  submittedAt: Date;
  tutor: mongoose.Types.ObjectId;
}

export interface IAttendanceSheetDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass?: mongoose.Types.ObjectId;
  groupClass?: mongoose.Types.ObjectId; // New: For Group Classes
  sheetType: 'SINGLE' | 'GROUP';
  coordinator?: mongoose.Types.ObjectId;
  month: number;
  year: number;
  cycleNumber: number;
  periodLabel: string;
  records: IDailyAttendanceRecord[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdBy: mongoose.Types.ObjectId;
  totalSessionsPlanned?: number;
  totalSessionsTaken?: number;
  presentCount?: number;
  absentCount?: number;
  renewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentAttendanceSchema = new Schema<IStudentAttendance>({
  student: { type: Schema.Types.ObjectId, ref: 'User' }, // Or student model
  enrollment: { type: Schema.Types.ObjectId, ref: 'StudentEnrollment' },
  status: { type: String, enum: Object.values(STUDENT_ATTENDANCE_STATUS), default: STUDENT_ATTENDANCE_STATUS.PRESENT },
  notes: { type: String }
}, { _id: false });

const DailyAttendanceRecordSchema = new Schema<IDailyAttendanceRecord>({
  sessionDate: { type: Date, required: true },
  durationHours: { type: Number, required: true },
  topicCovered: { type: String },
  studentAttendanceStatus: { type: String, enum: Object.values(STUDENT_ATTENDANCE_STATUS), default: STUDENT_ATTENDANCE_STATUS.PRESENT },
  studentAttendances: { type: [StudentAttendanceSchema] }, // For groups
  status: { type: String, enum: Object.values(ATTENDANCE_STATUS), default: ATTENDANCE_STATUS.PENDING },
  notes: { type: String },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date, default: Date.now },
  tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const AttendanceSheetSchema: Schema<IAttendanceSheetDocument> = new Schema<IAttendanceSheetDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass' },
    groupClass: { type: Schema.Types.ObjectId, ref: 'Groupleads' },
    sheetType: { type: String, enum: ['SINGLE', 'GROUP'], default: 'SINGLE' },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User' },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    cycleNumber: { type: Number, required: true },
    periodLabel: { type: String, required: true },
    records: { type: [DailyAttendanceRecordSchema], default: [] },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    submittedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    totalSessionsPlanned: { type: Number },
    totalSessionsTaken: { type: Number, default: 0 },
    presentCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    renewedAt: { type: Date },
  },
  { timestamps: true }
);

AttendanceSheetSchema.index({ coordinator: 1, status: 1 });

const AttendanceSheet: Model<IAttendanceSheetDocument> =
  mongoose.models.AttendanceSheet || mongoose.model<IAttendanceSheetDocument>('AttendanceSheet', AttendanceSheetSchema);

export default AttendanceSheet;
