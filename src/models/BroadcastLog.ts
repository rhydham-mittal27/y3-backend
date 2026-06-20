import mongoose, { Schema, Document } from 'mongoose';

export interface IBroadcastLog extends Document {
  subject: string;
  message: string;
  recipientGroup: string;
  recipientCount: number;
  sentBy: mongoose.Types.ObjectId;
  sentByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const BroadcastLogSchema = new Schema<IBroadcastLog>(
  {
    subject: { type: String, required: true },
    message: { type: String, required: true },
    recipientGroup: { type: String, required: true },
    recipientCount: { type: Number, required: true },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentByName: { type: String, required: true },
  },
  { timestamps: true }
);

BroadcastLogSchema.index({ createdAt: -1 });

export default mongoose.model<IBroadcastLog>('BroadcastLog', BroadcastLogSchema);
