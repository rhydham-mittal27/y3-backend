import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudentEnrollmentDocument extends Document {
  student: mongoose.Types.ObjectId;
  groupClass: mongoose.Types.ObjectId;
  monthlyFee: number;
  perSessionFee: number;
  sessionsAttended: number;
  sessionsVerified: number;
  parentPaymentStatus: 'PENDING' | 'PAID' | 'PARTIAL';
  status: 'ACTIVE' | 'PAUSED' | 'LEFT';
  enrollmentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentEnrollmentSchema: Schema<IStudentEnrollmentDocument> = new Schema<IStudentEnrollmentDocument>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // assuming Student is a User or separate model? Plan said User/Student.
    // Actually, distinct Student model exists? Let's check imports in other files. 
    // Payment.ts uses `import Student from '../models/Student';`
    
    groupClass: { type: Schema.Types.ObjectId, ref: 'GroupClass', required: true },
    monthlyFee: { type: Number, required: true, min: 0 },
    perSessionFee: { type: Number, required: true, min: 0 },
    sessionsAttended: { type: Number, default: 0 },
    sessionsVerified: { type: Number, default: 0 },
    parentPaymentStatus: { 
      type: String, 
      enum: ['PENDING', 'PAID', 'PARTIAL'], 
      default: 'PENDING' 
    },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'PAUSED', 'LEFT'], 
      default: 'ACTIVE' 
    },
    enrollmentDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
StudentEnrollmentSchema.index({ groupClass: 1, status: 1 });
StudentEnrollmentSchema.index({ student: 1, groupClass: 1 }, { unique: true }); // Prevent duplicate enrollment in same group

const StudentEnrollment: Model<IStudentEnrollmentDocument> =
  mongoose.models.StudentEnrollment || mongoose.model<IStudentEnrollmentDocument>('StudentEnrollment', StudentEnrollmentSchema);

export default StudentEnrollment;
