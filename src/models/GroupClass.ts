import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGroupClassDocument extends Document {
  name: string;
  tutor: mongoose.Types.ObjectId;
  description?: string;
  sessionsPerMonth?: number;
  tutorRatePerSession?: number; // Added for Payout Calculation
  schedule?: {
    daysOfWeek?: string[];
    timeSlot?: string;
  };
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GroupClassSchema: Schema<IGroupClassDocument> = new Schema<IGroupClassDocument>(
  {
    name: { type: String, required: true, trim: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String },
    sessionsPerMonth: { type: Number, default: 8 },
    tutorRatePerSession: { type: Number, default: 0 },
    schedule: {
      daysOfWeek: { type: [String] },
      timeSlot: { type: String },
    },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'PAUSED', 'COMPLETED'], 
      default: 'ACTIVE' 
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Indexes
GroupClassSchema.index({ tutor: 1, status: 1 });
GroupClassSchema.index({ status: 1 });

const GroupClass: Model<IGroupClassDocument> =
  mongoose.models.GroupClass || mongoose.model<IGroupClassDocument>('GroupClass', GroupClassSchema);

export default GroupClass;
