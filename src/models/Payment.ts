import mongoose, { Schema, Document, Model } from 'mongoose';
import { PAYMENT_STATUS, PAYMENT_METHOD, PAYMENT_TYPE } from '../config/constants';

export interface IPaymentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass?: mongoose.Types.ObjectId;
  groupClass?: mongoose.Types.ObjectId; // Added for Group support
  attendance?: mongoose.Types.ObjectId;
  attendanceSheet?: mongoose.Types.ObjectId;
  tutor?: mongoose.Types.ObjectId;
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
    groupClass: { type: Schema.Types.ObjectId, ref: 'GroupClass' },
    attendance: { type: Schema.Types.ObjectId, ref: 'Attendance' },
    attendanceSheet: { type: Schema.Types.ObjectId, ref: 'AttendanceSheet' },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
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
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
PaymentSchema.index({ attendance: 1 });
PaymentSchema.index({ attendanceSheet: 1 });
PaymentSchema.index({ tutor: 1, status: 1 });
PaymentSchema.index({ status: 1, dueDate: 1 });
PaymentSchema.index({ finalClass: 1 });
PaymentSchema.index({ createdAt: 1, status: 1 });

const Payment: Model<IPaymentDocument> =
  mongoose.models.Payment || mongoose.model<IPaymentDocument>('Payment', PaymentSchema);

export default Payment;
