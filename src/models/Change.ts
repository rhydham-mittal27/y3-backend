import mongoose, { Schema, Model } from 'mongoose';
import { CHANGE_ACTION } from '../config/constants';

export interface IRelatedToEmbedded {
  collection: string;
  documentId: mongoose.Types.ObjectId;
}

/** Raw document shape — Mongoose adds .save(), .populate() etc. via HydratedDocument internally */
export interface IChangeDocument {
  _id: mongoose.Types.ObjectId;
  /** Which MongoDB collection was mutated (e.g. "ClassLead", "Payment") */
  collection: string;
  /** _id of the document that was mutated */
  documentId: mongoose.Types.ObjectId;
  /** Human-readable identifier (e.g. student name, payment amount) */
  documentRef?: string;
  /** Type of mutation */
  action: CHANGE_ACTION | string;
  /** Names of the fields that changed */
  changedFields: string[];
  /** Snapshot of relevant fields BEFORE the change (absent for CREATE) */
  before?: Record<string, any>;
  /** Snapshot of relevant fields AFTER the change (absent for DELETE) */
  after?: Record<string, any>;
  /** User who triggered the change */
  changedBy: mongoose.Types.ObjectId;
  /** Role of the user at time of change */
  changedByRole?: string;
  /** Optional free-text reason (e.g. rejection reason, repost reason) */
  reason?: string;
  /** Optional link to a parent/related entity */
  relatedTo?: IRelatedToEmbedded;
  timestamp: Date;
  createdAt: Date;
}


const RelatedToSchema = new Schema<IRelatedToEmbedded>(
  {
    collection: { type: String, required: true },
    documentId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const ChangeSchema: Schema<IChangeDocument> = new Schema<IChangeDocument>(
  {
    collection: { type: String, required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, required: true, index: true },
    documentRef: { type: String },
    action: {
      type: String,
      enum: Object.values(CHANGE_ACTION),
      required: true,
      index: true,
    },
    changedFields: { type: [String], default: [] },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    changedByRole: { type: String },
    reason: { type: String },
    relatedTo: { type: RelatedToSchema },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound indexes for the most common queries
ChangeSchema.index({ collection: 1, documentId: 1, timestamp: -1 });
ChangeSchema.index({ changedBy: 1, timestamp: -1 });
ChangeSchema.index({ collection: 1, action: 1, timestamp: -1 });

const Change: Model<IChangeDocument> =
  mongoose.models.Change || mongoose.model<IChangeDocument>('Change', ChangeSchema);

export default Change;
