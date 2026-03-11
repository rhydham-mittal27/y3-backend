import mongoose, { Schema, Document, Model } from 'mongoose';

export type CLASS_SESSION_STATUS = 'PLANNED' | 'COMPLETED' | 'CANCELLED';

export interface IClassSessionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  coordinator?: mongoose.Types.ObjectId;
  sessionDate: Date;
  timeSlot: string;
  cycleMonth: number;
  cycleYear: number;
  sessionNumber: number;
  status: CLASS_SESSION_STATUS;
  createdAt: Date;
  updatedAt: Date;
}

const ClassSessionSchema: Schema<IClassSessionDocument> = new Schema<IClassSessionDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User' },
    sessionDate: { type: Date, required: true, index: true },
    timeSlot: { type: String, required: true },

    // The month/year this session belongs to for planning/cycle purposes.
    // Note: sessionDate may fall outside this month (spill-over behavior).
    cycleMonth: { type: Number, required: true, min: 1, max: 12, index: true },
    cycleYear: { type: Number, required: true, min: 2000, index: true },

    // 1..N inside the cycle.
    sessionNumber: { type: Number, required: true, min: 1 },

    status: { type: String, enum: ['PLANNED', 'COMPLETED', 'CANCELLED'], default: 'PLANNED' },
  },
  { timestamps: true }
);

ClassSessionSchema.index({ finalClass: 1, cycleYear: 1, cycleMonth: 1, sessionNumber: 1 }, { unique: true });
ClassSessionSchema.index({ finalClass: 1, sessionDate: 1 }, { unique: true });

const ClassSession: Model<IClassSessionDocument> =
  mongoose.models.ClassSession || mongoose.model<IClassSessionDocument>('ClassSession', ClassSessionSchema);

export default ClassSession;
