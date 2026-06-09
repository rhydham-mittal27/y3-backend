import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IParentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  children: mongoose.Types.ObjectId[]; // refs to Student
  primaryStudentName?: string;         // kept from lead for convenience before student is created
  primaryStudentGrade?: string;
  notes?: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const ParentSchema: Schema<IParentDocument> = new Schema<IParentDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    children: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    primaryStudentName:  { type: String, trim: true },
    primaryStudentGrade: { type: String, trim: true },
    notes:  { type: String, trim: true },
    source: { type: String, default: 'MOBILE_APP' },
  },
  { timestamps: true }
);

ParentSchema.index({ user: 1 });
ParentSchema.index({ children: 1 });

const Parent: Model<IParentDocument> =
  mongoose.models.Parent || mongoose.model<IParentDocument>('Parent', ParentSchema);

export default Parent;
