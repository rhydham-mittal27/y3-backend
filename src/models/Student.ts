import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  studentId: string;
  name: string;
  gender: 'M' | 'F';
  grade: string;
  finalClass: mongoose.Types.ObjectId;
  classLead: mongoose.Types.ObjectId;
  password: string;
  isPasswordChanged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema: Schema<IStudentDocument> = new Schema<IStudentDocument>(
  {
    studentId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['M', 'F'], required: true },
    grade: { type: String, required: true },
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true },
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead', required: true },
    password: { type: String, required: true },
    isPasswordChanged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
StudentSchema.index({ finalClass: 1 });
StudentSchema.index({ classLead: 1 });
StudentSchema.index({ name: 'text' });

const Student: Model<IStudentDocument> =
  mongoose.models.Student || mongoose.model<IStudentDocument>('Student', StudentSchema);

export default Student;
