
import mongoose, { Schema, Document, Model } from 'mongoose';
import { BOARD_TYPE } from '../config/constants';

export interface IGroupleadsDocument extends Document {
  name: string;
  tutor?: mongoose.Types.ObjectId;
  description?: string;
  sessionsPerMonth?: number;
  tutorRatePerSession?: number;
  schedule?: {
    daysOfWeek?: string[];
    timeSlot?: string;
  };
  students?: Array<{
    name: string;
    gender: 'M' | 'F';
    fees: number;
    tutorFees: number;
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    board?: string;
    grade?: string;
    subject?: string[];
  }>;
  grade?: string;
  board?: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  classLead?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GroupleadsSchema: Schema<IGroupleadsDocument> = new Schema<IGroupleadsDocument>(
  {
    name: { type: String, required: true, trim: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User' },
    description: { type: String },
    sessionsPerMonth: { type: Number, default: 8 },
    tutorRatePerSession: { type: Number, default: 0 },
    schedule: {
      daysOfWeek: { type: [String] },
      timeSlot: { type: String },
    },
    students: {
      type: [{
        name: { type: String, required: true },
        gender: { type: String, enum: ['M', 'F'], required: true },
        fees: { type: Number, required: true },
        tutorFees: { type: Number, required: true },
        parentName: { type: String },
        parentEmail: { type: String },
        parentPhone: { type: String },
        board: { type: String },
        grade: { type: String },
        subject: { type: [String] },
      }],
      _id: false
    },
    grade: { type: String },
    board: { type: String, enum: Object.values(BOARD_TYPE) },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'PAUSED', 'COMPLETED'], 
      default: 'ACTIVE' 
    },
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Indexes
GroupleadsSchema.index({ tutor: 1, status: 1 });
GroupleadsSchema.index({ status: 1 });
GroupleadsSchema.index({ classLead: 1 });

const Groupleads: Model<IGroupleadsDocument> =
  mongoose.models.Groupleads || mongoose.model<IGroupleadsDocument>('Groupleads', GroupleadsSchema);

export default Groupleads;
