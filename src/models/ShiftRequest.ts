import mongoose, { Document, Schema } from 'mongoose';

export type ShiftRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IShiftRequestDocument extends Document {
  finalClass: mongoose.Types.ObjectId;
  cycleNumber: number;
  requestedBy: mongoose.Types.ObjectId;   // tutor user id
  shiftDays: number;                       // positive = forward, negative = backward
  reason: string;
  status: ShiftRequestStatus;
  approvedBy?: mongoose.Types.ObjectId;   // coordinator user id
  approvedAt?: Date;
  rejectionReason?: string;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ShiftRequestSchema = new Schema<IShiftRequestDocument>(
  {
    finalClass:      { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true },
    cycleNumber:     { type: Number, required: true, min: 1 },
    requestedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shiftDays:       { type: Number, required: true },
    reason:          { type: String, required: true, trim: true },
    status:          { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    approvedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt:      { type: Date },
    rejectionReason: { type: String, trim: true },
    appliedAt:       { type: Date },
  },
  { timestamps: true },
);

ShiftRequestSchema.index({ finalClass: 1, cycleNumber: 1 });
ShiftRequestSchema.index({ requestedBy: 1, status: 1 });
ShiftRequestSchema.index({ finalClass: 1, status: 1 });

export default mongoose.model<IShiftRequestDocument>('ShiftRequest', ShiftRequestSchema);
