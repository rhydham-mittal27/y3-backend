import mongoose, { Schema, Document, Model } from 'mongoose';
import { COORDINATOR_ACTION_TYPE } from '../config/constants';

export interface ICoordinatorRelatedEntityEmbedded {
  entityType: 'FinalClass' | 'Test' | 'Payment' | 'Attendance';
  entityId: mongoose.Types.ObjectId;
  entityName?: string;
}

export interface ICoordinatorActivityLogDocument extends Document {
  _id: mongoose.Types.ObjectId;
  coordinator: mongoose.Types.ObjectId; // references User (role=COORDINATOR)
  actionType: COORDINATOR_ACTION_TYPE | string;
  actionDescription: string;
  relatedEntity?: ICoordinatorRelatedEntityEmbedded;
  metadata?: any;
  timestamp: Date;
  createdAt: Date;
}

const CoordinatorRelatedEntitySchema = new Schema<ICoordinatorRelatedEntityEmbedded>(
  {
    entityType: {
      type: String,
      enum: ['FinalClass', 'Test', 'Payment', 'Attendance'],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityName: { type: String },
  },
  { _id: false }
);

const CoordinatorActivityLogSchema: Schema<ICoordinatorActivityLogDocument> = new Schema<ICoordinatorActivityLogDocument>(
  {
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actionType: { type: String, enum: Object.values(COORDINATOR_ACTION_TYPE), required: true, index: true },
    actionDescription: { type: String, required: true },
    relatedEntity: { type: CoordinatorRelatedEntitySchema },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CoordinatorActivityLogSchema.index({ coordinator: 1, timestamp: -1 });
CoordinatorActivityLogSchema.index({ 'relatedEntity.entityType': 1, 'relatedEntity.entityId': 1 });

const CoordinatorActivityLog: Model<ICoordinatorActivityLogDocument> =
  mongoose.models.CoordinatorActivityLog || mongoose.model<ICoordinatorActivityLogDocument>('CoordinatorActivityLog', CoordinatorActivityLogSchema);

export default CoordinatorActivityLog;
