import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IParentLeadDocument extends Document {
  _id: mongoose.Types.ObjectId;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  studentName: string;
  studentGrade?: string;
  city?: string;
  notes?: string;
  source: string;
  status: 'NEW' | 'CONTACTED' | 'ENROLLED' | 'CLOSED';
  user?: mongoose.Types.ObjectId; // set when lead converts to a real User account
  createdAt: Date;
  updatedAt: Date;
}

const ParentLeadSchema: Schema<IParentLeadDocument> = new Schema<IParentLeadDocument>(
  {
    parentName:   { type: String, required: true, trim: true },
    parentEmail:  { type: String, required: true, trim: true, lowercase: true },
    parentPhone:  { type: String, required: true, trim: true },
    studentName:  { type: String, required: true, trim: true },
    studentGrade: { type: String, trim: true },
    city:         { type: String, trim: true },
    notes:        { type: String, trim: true },
    source:       { type: String, default: 'MOBILE_APP' },
    status:       {
      type: String,
      enum: ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'],
      default: 'NEW',
    },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ParentLeadSchema.index({ parentEmail: 1 });
ParentLeadSchema.index({ parentPhone: 1 });
ParentLeadSchema.index({ status: 1 });
ParentLeadSchema.index({ createdAt: -1 });

const ParentLead: Model<IParentLeadDocument> =
  mongoose.models.ParentLead ||
  mongoose.model<IParentLeadDocument>('ParentLead', ParentLeadSchema);

export default ParentLead;
