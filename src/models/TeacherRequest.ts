import mongoose, { Schema, Document, Model } from 'mongoose';
import { TEACHING_MODE } from '../config/constants';

export type TeacherRequestStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'DEMO_SCHEDULED'
  | 'DEMO_COMPLETED'
  | 'CONVERTED'
  | 'CLOSED';

export interface ITeacherRequestDocument extends Document {
  _id: mongoose.Types.ObjectId;
  requestId: string;

  // Who submitted
  parent: mongoose.Types.ObjectId;   // ref: User
  submitterType: 'PARENT' | 'STUDENT';

  // Student
  studentName: string;

  // Curriculum hierarchy — all stored as Option ObjectIds
  board: mongoose.Types.ObjectId;              // Option type=BOARD
  grade: mongoose.Types.ObjectId;              // Option type=GRADE
  subjects: mongoose.Types.ObjectId[];         // Option type=SUBJECT (multi)

  // Class preferences
  mode: TEACHING_MODE | string;
  preferredDays: string[];
  preferredTimeSlot?: string;

  // Location (only relevant for OFFLINE/HYBRID)
  address?: string;
  city?: string;

  // Budget
  budgetRange?: string;

  // Misc
  notes?: string;
  status: TeacherRequestStatus;

  createdAt: Date;
  updatedAt: Date;
}

const TeacherRequestSchema = new Schema<ITeacherRequestDocument>(
  {
    requestId: { type: String, unique: true },

    parent:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submitterType: { type: String, enum: ['PARENT', 'STUDENT'], default: 'PARENT' },

    studentName: { type: String, required: true, trim: true },

    board:    { type: Schema.Types.ObjectId, ref: 'Option', required: true },
    grade:    { type: Schema.Types.ObjectId, ref: 'Option', required: true },
    subjects: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
      required: true,
      validate: {
        validator: (v: any[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one subject is required',
      },
    },

    mode: {
      type: String,
      enum: Object.values(TEACHING_MODE),
      required: true,
    },

    preferredDays:     { type: [String], default: [] },
    preferredTimeSlot: { type: String },

    address: { type: String, trim: true },
    city:    { type: String, trim: true },

    budgetRange: { type: String, trim: true },
    notes:       { type: String, trim: true, maxlength: 1000 },

    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'CONVERTED', 'CLOSED'],
      default: 'NEW',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Auto-generate requestId on save
TeacherRequestSchema.pre('save', async function (next) {
  if (!this.requestId) {
    const count = await (mongoose.models.TeacherRequest as Model<ITeacherRequestDocument>).countDocuments();
    this.requestId = `TR-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

TeacherRequestSchema.index({ parent: 1, status: 1 });
TeacherRequestSchema.index({ status: 1, createdAt: -1 });
TeacherRequestSchema.index({ board: 1 });

const TeacherRequest: Model<ITeacherRequestDocument> =
  mongoose.models.TeacherRequest ||
  mongoose.model<ITeacherRequestDocument>('TeacherRequest', TeacherRequestSchema);

export default TeacherRequest;
