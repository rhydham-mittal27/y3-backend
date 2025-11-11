import mongoose, { Schema, Document, Model } from 'mongoose';
import { PAYMENT_STATUS, PAYMENT_METHOD } from '../config/constants';

export interface IPaymentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  finalClass: mongoose.Types.ObjectId;
  attendance: mongoose.Types.ObjectId;
  tutor: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: PAYMENT_STATUS | string;
  paymentMethod?: PAYMENT_METHOD | string;
  transactionId?: string;
  paymentDate?: Date;
  dueDate: Date;
  paidBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema<IPaymentDocument> = new Schema<IPaymentDocument>(
  {
    finalClass: { type: Schema.Types.ObjectId, ref: 'FinalClass', required: true, index: true },
    attendance: { type: Schema.Types.ObjectId, ref: 'Attendance', required: true, unique: true },
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHOD) },
    transactionId: { type: String },
    paymentDate: { type: Date },
    dueDate: { type: Date, required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Indexes
PaymentSchema.index({ attendance: 1 }, { unique: true });
PaymentSchema.index({ tutor: 1, status: 1 });
PaymentSchema.index({ status: 1, dueDate: 1 });
PaymentSchema.index({ finalClass: 1 });
PaymentSchema.index({ createdAt: 1, status: 1 });

const Payment: Model<IPaymentDocument> =
  mongoose.models.Payment || mongoose.model<IPaymentDocument>('Payment', PaymentSchema);

export default Payment;
