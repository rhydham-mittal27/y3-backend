import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  BOARD_TYPE,
  CLASS_LEAD_STATUS,
  DEMO_STATUS,
  TEACHING_MODE,
  LEAD_SOURCE,
  PREFERRED_TUTOR_GENDER,
} from '../config/constants';

export interface IDemoDetailsEmbedded {
  demoDate?: Date;
  demoTime?: string;
  demoStatus?: DEMO_STATUS | string;
  feedback?: string;
  assignedAt?: Date;
  attendanceStatus?: 'PRESENT' | 'ABSENT';
  topicCovered?: string;
  duration?: string;
}

export interface IStudentDetail {
  name: string;
  gender: 'M' | 'F';
  fees: number;
  tutorFees: number;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  board?: string;
  grade?: string;
  subject?: mongoose.Types.ObjectId[];
}

export interface IClassLeadDocument extends Document {
  _id: mongoose.Types.ObjectId;
  leadId: string;
  studentType: 'SINGLE' | 'GROUP';
  studentName: string;
  studentGender?: 'M' | 'F';
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  grade?: string; // Only for single student
  subject: mongoose.Types.ObjectId[]; // Only for single student
  board: BOARD_TYPE | string;
  mode: TEACHING_MODE | string;
  location?: string;
  city?: string;
  area?: string;
  address?: string;
  timing: string;
  weekdays?: string[];
  status: CLASS_LEAD_STATUS | string;
  classesPerMonth?: number;
  classDurationHours?: number;
  paymentAmount?: number;
  tutorFees?: number;
  preferredTutorGender?: PREFERRED_TUTOR_GENDER | string;
  leadSource?: LEAD_SOURCE | string;
  paymentReceived?: boolean;
  assignedTutor?: mongoose.Types.ObjectId | null;
  demoTutor?: mongoose.Types.ObjectId | null;
  demoDetails?: IDemoDetailsEmbedded;
  createdBy: mongoose.Types.ObjectId;
  notes?: string;
  internalNotes?: string;

  // Group specific fields
  groupClass?: mongoose.Types.ObjectId;
  numberOfStudents?: number;
  studentDetails?: IStudentDetail[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const DemoDetailsSchema = new Schema<IDemoDetailsEmbedded>(
  {
    demoDate: { type: Date },
    demoTime: { type: String },
    demoStatus: { type: String },
    feedback: { type: String },
    assignedAt: { type: Date },
    attendanceStatus: { type: String, enum: ['PRESENT', 'ABSENT'] },
    topicCovered: { type: String },
    duration: { type: String },
  },
  { _id: false }
);

const StudentDetailSchema = new Schema<IStudentDetail>({
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['M', 'F'], required: true },
  fees: {
    type: Number,
    required: true,
    min: [0, 'Fees cannot be negative']
  },
  tutorFees: {
    type: Number,
    required: true,
    min: [0, 'Tutor fees cannot be negative']
  },
  parentName: { type: String, trim: true },
  parentEmail: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
  },
  parentPhone: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number'],
  },
  // Per-student curriculum for groups
  board: { type: String },
  grade: { type: String },
  subject: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
}, { _id: false });

const ClassLeadSchema = new Schema<IClassLeadDocument>(
  {
    leadId: { type: String, unique: true },
    studentType: {
      type: String,
      required: true,
      enum: ['SINGLE', 'GROUP'],
      default: 'SINGLE'
    },
    studentName: {
      type: String,
      required: [
        function (this: IClassLeadDocument) { return this.studentType === 'SINGLE'; },
        'Student name is required for single student'
      ],
      trim: true
    },
    studentGender: {
      type: String,
      enum: ['M', 'F'],
      required: [
        function (this: IClassLeadDocument) { return this.studentType === 'SINGLE'; },
        'Student gender is required for single student'
      ]
    },
    parentName: { type: String, trim: true },
    parentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    },
    parentPhone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
    },
    grade: {
      type: String,
      required: [
        function (this: IClassLeadDocument) { return this.studentType === 'SINGLE' || this.studentType === 'GROUP'; },
        'Grade is required'
      ]
    },
    subject: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
      required: [
        function (this: any) {
          return this.studentType === 'SINGLE' || this.studentType === 'GROUP';
        },
        'At least one subject is required'
      ],
      validate: [
        function (this: any, val: any[]) {
          return (this.studentType !== 'SINGLE' && this.studentType !== 'GROUP') || (Array.isArray(val) && val.length > 0);
        },
        'At least one subject is required'
      ]
    },
    board: { 
      type: String, 
      required: [
        function (this: IClassLeadDocument) { return this.studentType === 'SINGLE'; },
        'Board is required for single student'
      ]
    },
    mode: { type: String, required: true },
    location: { type: String },
    city: { type: String },
    area: { type: String },
    address: { type: String },
    timing: { type: String, required: true },
    weekdays: { type: [String] },
    status: { type: String, default: CLASS_LEAD_STATUS.NEW },
    
    // Group specific fields
    numberOfStudents: {
      type: Number,
      min: [1, 'At least one student is required'],
      max: [10, 'Maximum 10 students allowed'],
      required: [
        function (this: IClassLeadDocument) { return this.studentType === 'GROUP'; },
        'Number of students is required for group'
      ]
    },
    studentDetails: {
      type: [StudentDetailSchema],
      required: [
        function (this: IClassLeadDocument) {
          return this.studentType === 'GROUP';
        },
        'Student details are required for group'
      ],
      validate: [
        function (this: IClassLeadDocument, val: IStudentDetail[]) {
          return this.studentType !== 'GROUP' || (Array.isArray(val) && val.length > 0);
        },
        'At least one student detail is required for group'
      ]
    },
    classesPerMonth: { type: Number },
    classDurationHours: { type: Number },
    paymentAmount: { type: Number, min: 0 },
    tutorFees: { type: Number, min: 0 },
    preferredTutorGender: { type: String },
    leadSource: { type: String },
    paymentReceived: { type: Boolean, default: false },
    assignedTutor: { type: Schema.Types.ObjectId, ref: 'User' },
    demoTutor: { type: Schema.Types.ObjectId, ref: 'User' },
    demoDetails: { type: DemoDetailsSchema },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    groupClass: { type: Schema.Types.ObjectId, ref: 'Groupleads' },
    notes: { type: String },
    internalNotes: { type: String, select: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes
ClassLeadSchema.index({ status: 1, createdAt: -1 });
ClassLeadSchema.index({ createdBy: 1 });
ClassLeadSchema.index({ createdBy: 1, status: 1 });          // dashboard: manager lead counts by status
ClassLeadSchema.index({ createdBy: 1, createdAt: -1 });      // dashboard: date-wise chart by manager
ClassLeadSchema.index({ assignedTutor: 1 });
ClassLeadSchema.index({ leadSource: 1, status: 1 });         // CRM: website leads / open leads count
ClassLeadSchema.index({ studentName: 'text' });


const ClassLead: Model<IClassLeadDocument> =
  mongoose.models.ClassLead || mongoose.model<IClassLeadDocument>('ClassLead', ClassLeadSchema);

export default ClassLead;
