import mongoose, { Schema, Document, Model } from 'mongoose';
import { PAYMENT_STATUS, PAYMENT_METHOD, PAYMENT_TYPE } from '../config/constants';

export interface IPaymentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  paymentId: string;
  finalClass?: mongoose.Types.ObjectId;
  groupClass?: mongoose.Types.ObjectId; // Added for Group support
  student?: mongoose.Types.ObjectId; // Added for individual student payments
  attendance?: mongoose.Types.ObjectId;
  attendanceSheet?: mongoose.Types.ObjectId;
  tutor?: mongoose.Types.ObjectId;
  cycleMonth?: number;
  cycleYear?: number;
  amount: number;
  currency: string;
  status: PAYMENT_STATUS | string;
  paymentMethod?: PAYMENT_METHOD | string;
  paymentType?: PAYMENT_TYPE | string;
  transactionId?: string;
  paymentDate?: Date;
  dueDate: Date;
  paidBy?: mongoose.Types.ObjectId;
  paymentProof?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema<IPaymentDocument> = new Schema<IPaymentDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass' },
    groupClass: { type: Schema.Types.ObjectId, ref: 'Groupleads' },
    student: { type: Schema.Types.ObjectId, ref: 'Student' }, // Added for individual student payments
    attendance: { type: Schema.Types.ObjectId, ref: 'Attendance' },
    attendanceSheet: { type: Schema.Types.ObjectId, ref: 'AttendanceSheet' },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    cycleMonth: { type: Number, min: 1, max: 12 },
    cycleYear: { type: Number, min: 2000 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHOD) },
    paymentType: { type: String, enum: Object.values(PAYMENT_TYPE), default: PAYMENT_TYPE.FEES_COLLECTED },
    transactionId: { type: String },
    paymentDate: { type: Date },
    dueDate: { type: Date, required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentProof: { type: String },
    notes: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentId: { type: String, unique: true, sparse: true },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Auto-generate paymentId like PAY-2024-0001
PaymentSchema.pre('save', async function (next) {
  if (this.paymentId) return next();
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  const last = await (this.constructor as Model<IPaymentDocument>)
    .findOne({ paymentId: { $regex: `^${prefix}` } })
    .sort({ paymentId: -1 })
    .select('paymentId')
    .lean();
  const lastNum = last?.paymentId ? parseInt(last.paymentId.split('-')[2] ?? '0', 10) : 0;
  this.paymentId = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
  next();
});

// Indexes
PaymentSchema.index({ attendance: 1 });
PaymentSchema.index({ attendanceSheet: 1 });
PaymentSchema.index({ tutor: 1, status: 1 });
PaymentSchema.index({ status: 1, dueDate: 1 });
PaymentSchema.index({ finalClass: 1 });
PaymentSchema.index({ finalClass: 1, paymentType: 1, cycleYear: 1, cycleMonth: 1 });
PaymentSchema.index({ createdAt: 1, status: 1 });

const Payment: Model<IPaymentDocument> =
  mongoose.models.Payment || mongoose.model<IPaymentDocument>('Payment', PaymentSchema);

export default Payment;
