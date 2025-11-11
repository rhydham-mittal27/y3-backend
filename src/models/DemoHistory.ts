import mongoose, { Document, Schema } from 'mongoose';
import { DEMO_STATUS } from '../config/constants';

export interface IDemoHistoryDocument extends Document {
  classLead: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  demoDate: Date;
  demoTime: string;
  status: DEMO_STATUS;
  assignedBy: mongoose.Types.ObjectId;
  assignedAt: Date;
  completedAt?: Date;
  resultUpdatedAt?: Date;
  resultUpdatedBy?: mongoose.Types.ObjectId;
  feedback?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DemoHistorySchema = new Schema<IDemoHistoryDocument>(
  {
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead', required: true, index: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    demoDate: { type: Date, required: true },
    demoTime: { type: String, required: true },
    status: { type: String, enum: Object.values(DEMO_STATUS), required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    resultUpdatedAt: { type: Date },
    resultUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    feedback: { type: String },
    rejectionReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

DemoHistorySchema.index({ classLead: 1, createdAt: -1 });
DemoHistorySchema.index({ tutor: 1 });

export default (mongoose.models.DemoHistory as mongoose.Model<IDemoHistoryDocument>) ||
  mongoose.model<IDemoHistoryDocument>('DemoHistory', DemoHistorySchema);
