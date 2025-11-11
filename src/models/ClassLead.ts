import mongoose, { Schema, Document, Model } from 'mongoose';
import { BOARD_TYPE, CLASS_LEAD_STATUS, DEMO_STATUS, TEACHING_MODE } from '../config/constants';

export interface IDemoDetailsEmbedded {
  demoDate?: Date;
  demoTime?: string;
  demoStatus?: DEMO_STATUS | string;
  feedback?: string;
  assignedAt?: Date;
}

export interface IClassLeadDocument extends Document {
  _id: mongoose.Types.ObjectId;
  studentName: string;
  grade: string;
  subject: string[];
  board: BOARD_TYPE | string;
  mode: TEACHING_MODE | string;
  location?: string;
  timing: string;
  status: CLASS_LEAD_STATUS | string;
  assignedTutor?: mongoose.Types.ObjectId | null;
  demoDetails?: IDemoDetailsEmbedded;
  createdBy: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DemoDetailsSchema = new Schema<IDemoDetailsEmbedded>(
  {
    demoDate: { type: Date },
    demoTime: { type: String },
    demoStatus: { type: String, enum: Object.values(DEMO_STATUS) },
    feedback: { type: String },
    assignedAt: { type: Date },
  },
  { _id: false }
);

const ClassLeadSchema: Schema<IClassLeadDocument> = new Schema<IClassLeadDocument>(
  {
    studentName: { type: String, required: true, trim: true },
    grade: { type: String, required: true },
    subject: { type: [String], required: true },
    board: { type: String, enum: Object.values(BOARD_TYPE), required: true },
    mode: { type: String, enum: Object.values(TEACHING_MODE), required: true },
    location: { type: String },
    timing: { type: String, required: true },
    status: { type: String, enum: Object.values(CLASS_LEAD_STATUS), default: CLASS_LEAD_STATUS.NEW },
    assignedTutor: { type: Schema.Types.ObjectId, ref: 'User' },
    demoDetails: { type: DemoDetailsSchema },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes
ClassLeadSchema.index({ status: 1, createdAt: -1 });
ClassLeadSchema.index({ createdBy: 1 });
ClassLeadSchema.index({ assignedTutor: 1 });
ClassLeadSchema.index({ studentName: 'text' });

const ClassLead: Model<IClassLeadDocument> =
  mongoose.models.ClassLead || mongoose.model<IClassLeadDocument>('ClassLead', ClassLeadSchema);

export default ClassLead;
