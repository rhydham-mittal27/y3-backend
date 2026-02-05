import mongoose, { Schema, Document, Model } from 'mongoose';
import { BOARD_TYPE } from '../config/constants';

export interface IGroupStudentDetail {
  name: string;
  gender: 'M' | 'F';
  fees: number;
  tutorFees: number;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  board?: string;
  grade?: string;
  subject?: string[];
}

export interface IGroupClassDocument extends Document {
  _id: mongoose.Types.ObjectId;
  classLead: mongoose.Types.ObjectId;
  students: IGroupStudentDetail[];
  totalFees: number;
  totalTutorFees: number;
  grade?: string;
  board?: BOARD_TYPE | string;
  createdAt: Date;
  updatedAt: Date;
}

const GroupStudentSchema = new Schema<IGroupStudentDetail>({
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['M', 'F'], required: true },
  fees: { type: Number, required: true, min: 0 },
  tutorFees: { type: Number, required: true, min: 0 },
  parentName: { type: String, trim: true },
  parentEmail: { type: String, trim: true, lowercase: true },
  parentPhone: { type: String, trim: true },
  board: { type: String, enum: Object.values(BOARD_TYPE) },
  grade: { type: String },
  subject: { type: [String] },
}, { _id: false });

const GroupClassSchema: Schema<IGroupClassDocument> = new Schema<IGroupClassDocument>(
  {
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead', required: true, unique: true },
    students: { type: [GroupStudentSchema], required: true },
    totalFees: { type: Number, default: 0 },
    totalTutorFees: { type: Number, default: 0 },
    grade: { type: String },
    board: { type: String, enum: Object.values(BOARD_TYPE) },
  },
  { timestamps: true }
);

// Middleware to calculate totals before saving
GroupClassSchema.pre('save', function (next) {
  if (this.students && this.students.length > 0) {
    this.totalFees = this.students.reduce((sum, s) => sum + (s.fees || 0), 0);
    this.totalTutorFees = this.students.reduce((sum, s) => sum + (s.tutorFees || 0), 0);
  }
  next();
});

const GroupClass: Model<IGroupClassDocument> =
  mongoose.models.GroupClass || mongoose.model<IGroupClassDocument>('GroupClass', GroupClassSchema);

export default GroupClass;
