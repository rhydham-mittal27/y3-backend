import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOptionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  type: string; // e.g. SUBJECT, CITY, BOARD
  label: string;
  value: string;
  isActive: boolean;
  sortOrder?: number;
  parent?: mongoose.Types.ObjectId | IOptionDocument | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const OptionSchema: Schema<IOptionDocument> = new Schema<IOptionDocument>(
  {
    type: { type: String, required: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Option', default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

OptionSchema.index({ type: 1, value: 1 }, { unique: true });
OptionSchema.index({ type: 1, isActive: 1, sortOrder: 1, label: 1 });

const Option: Model<IOptionDocument> =
  mongoose.models.Option || mongoose.model<IOptionDocument>('Option', OptionSchema);

export default Option;
