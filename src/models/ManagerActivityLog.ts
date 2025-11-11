import mongoose, { Schema, Document, Model } from 'mongoose';
import { MANAGER_ACTION_TYPE } from '../config/constants';

export interface IRelatedEntityEmbedded {
  entityType: 'ClassLead' | 'FinalClass' | 'Demo' | 'Payment' | 'Tutor' | 'Coordinator' | 'Announcement';
  entityId: mongoose.Types.ObjectId;
  entityName?: string;
}

export interface IManagerActivityLogDocument extends Document {
  _id: mongoose.Types.ObjectId;
  manager: mongoose.Types.ObjectId; // references User (role=MANAGER)
  actionType: MANAGER_ACTION_TYPE | string;
  actionDescription: string;
  relatedEntity?: IRelatedEntityEmbedded;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  createdAt: Date;
}

const RelatedEntitySchema = new Schema<IRelatedEntityEmbedded>(
  {
    entityType: {
      type: String,
      enum: ['ClassLead', 'FinalClass', 'Demo', 'Payment', 'Tutor', 'Coordinator', 'Announcement'],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityName: { type: String },
  },
  { _id: false }
);

const ManagerActivityLogSchema: Schema<IManagerActivityLogDocument> = new Schema<IManagerActivityLogDocument>(
  {
    manager: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actionType: { type: String, enum: Object.values(MANAGER_ACTION_TYPE), required: true, index: true },
    actionDescription: { type: String, required: true },
    relatedEntity: { type: RelatedEntitySchema },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
ManagerActivityLogSchema.index({ manager: 1, timestamp: -1 });
ManagerActivityLogSchema.index({ 'relatedEntity.entityType': 1, 'relatedEntity.entityId': 1 });

const ManagerActivityLog: Model<IManagerActivityLogDocument> =
  mongoose.models.ManagerActivityLog || mongoose.model<IManagerActivityLogDocument>('ManagerActivityLog', ManagerActivityLogSchema);

export default ManagerActivityLog;
