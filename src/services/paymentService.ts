import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import ErrorResponse from '../utils/errorResponse';
import { PAYMENT_STATUS, PAYMENT_METHOD, ATTENDANCE_STATUS, MANAGER_ACTION_TYPE } from '../config/constants';
import { logError } from '../utils/logger';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import { createNotificationWithPreferences } from './notificationService';

const DEFAULT_DUE_DAYS = 7;

export const createPayment = async (attendanceId: string, createdBy: string) => {
  const attendance = await Attendance.findById(attendanceId).populate([{ path: 'finalClass' }]);
  if (!attendance) throw new ErrorResponse('Attendance not found', 404);
  if (String(attendance.status) !== ATTENDANCE_STATUS.PARENT_APPROVED) {
    throw new ErrorResponse('Attendance is not parent-approved', 400);
  }

  const existing = await Payment.findOne({ attendance: new mongoose.Types.ObjectId(attendanceId) });
  if (existing) throw new ErrorResponse('Payment already exists for this attendance', 409);

  const cls = attendance.finalClass as any;
  if (!cls) throw new ErrorResponse('Final class not found for attendance', 404);
  const rate = cls.ratePerSession;
  if (!rate || rate <= 0) throw new ErrorResponse('Rate per session not set for this class', 400);

  const amount = rate;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

  const payment = await Payment.create({
    finalClass: cls._id,
    attendance: attendance._id,
    tutor: attendance.tutor,
    amount,
    currency: 'INR',
    status: PAYMENT_STATUS.PENDING,
    dueDate,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });

  await payment.populate([
    { path: 'finalClass' },
    { path: 'attendance' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
  ]);

  try {
    await createNotificationWithPreferences({
      recipient: attendance.tutor as any,
      type: 'PAYMENT',
      title: 'Payment Created',
      message: `A payment of INR ${amount} is created for your approved session. Due by ${dueDate.toDateString()}.`,
    });
  } catch (e) {
    logError(`Failed to create payment notification: ${String(e)}`);
  }

  return payment;
};

export const createAdvancePaymentForFinalClass = async (finalClassId: string, createdBy: string) => {
  const finalClass = await FinalClass.findById(finalClassId).populate([{ path: 'classLead' }]);
  if (!finalClass) throw new ErrorResponse('Final class not found', 404);

  const cls: any = finalClass as any;
  const lead: any = cls.classLead;
  const amount = lead?.paymentAmount;

  if (!amount || amount <= 0) {
    throw new ErrorResponse('Advance payment amount not set for this class lead', 400);
  }

  const existing = await Payment.findOne({ finalClass: finalClass._id, attendance: { $exists: false } });
  if (existing) {
    return existing;
  }

  const dueDate = new Date(cls.startDate || Date.now());
  dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

  const payment = await Payment.create({
    finalClass: finalClass._id,
    tutor: cls.tutor,
    amount,
    currency: 'INR',
    status: PAYMENT_STATUS.PENDING,
    dueDate,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    notes: 'Advance class payment',
  });

  await payment.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return payment;
};

export const sendPaymentReminder = async (args: { paymentId: string; reminderMessage?: string; sentBy: string }) => {
  // TODO: Use sentBy for logging/audit purposes
  const { paymentId, reminderMessage } = args;
  const payment = await Payment.findById(paymentId).populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
  ]);
  if (!payment) throw new ErrorResponse('Payment not found', 404);

  const status = String(payment.status) as PAYMENT_STATUS | string;
  if (status === PAYMENT_STATUS.PAID) {
    throw new ErrorResponse('Cannot send reminder for paid payment', 400);
  }

  const cls: any = payment.finalClass as any;
  const parent = cls?.parent;
  if (!parent) throw new ErrorResponse('Parent not found for this class', 400);

  const dueText = payment.dueDate ? new Date(payment.dueDate).toDateString() : 'soon';
  const defaultMsg = `Your payment of INR ${payment.amount} for ${cls?.studentName || 'your child'}'s class is ${
    status === PAYMENT_STATUS.OVERDUE ? 'overdue' : 'due'
  } on ${dueText}. Please make the payment at your earliest convenience.`;

  try {
    await createNotificationWithPreferences({
      recipient: parent as any,
      type: 'PAYMENT',
      title: status === PAYMENT_STATUS.OVERDUE ? 'Payment Overdue Reminder' : 'Payment Due Reminder',
      message: (reminderMessage && reminderMessage.trim().length > 0) ? reminderMessage : defaultMsg,
    });
  } catch (e) {
    logError(`Failed to create payment reminder notification: ${String(e)}`);
    throw new ErrorResponse('Failed to send payment reminder', 500);
  }

  return { success: true, message: 'Payment reminder sent successfully' };
};

export const getAllPayments = async (args: {
  page: number;
  limit: number;
  status?: PAYMENT_STATUS | string;
  tutorId?: string;
  finalClassId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, status, tutorId, finalClassId, fromDate, toDate, sortBy, sortOrder } = args;
  const query: any = {};
  if (status) query.status = status;
  if (tutorId) query.tutor = new mongoose.Types.ObjectId(tutorId);
  if (finalClassId) query.finalClass = new mongoose.Types.ObjectId(finalClassId);
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'finalClass' },
        { path: 'attendance' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'createdBy', select: 'name email' },
        { path: 'paidBy', select: 'name email' },
      ]),
    Payment.countDocuments(query),
  ]);

  return { payments, total, page, limit };
};

export const getPaymentById = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId).populate([
    { path: 'finalClass' },
    { path: 'attendance' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
    { path: 'paidBy', select: 'name email' },
  ]);
  if (!payment) throw new ErrorResponse('Payment not found', 404);
  return payment;
};

export const updatePaymentStatus = async (
  paymentId: string,
  newStatus: PAYMENT_STATUS,
  paymentMethod?: PAYMENT_METHOD,
  transactionId?: string,
  notes?: string,
  paidBy?: string,
  currentUser?: { id: string; role: string }
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find payment with necessary population
    const payment = await Payment.findById(paymentId)
      .populate('finalClass')
      .populate('tutor')
      .session(session);

    if (!payment) {
      throw new ErrorResponse('Payment not found', 404);
    }

    // Check if the current user is a parent trying to update the payment
    if (currentUser?.role === 'parent') {
      // Get the final class to check if the parent is associated with it
      const finalClass = await FinalClass.findById(payment.finalClass)
        .populate('student')
        .session(session);

      // @ts-ignore - Ignore TypeScript error for student.parent access
      if (finalClass?.student?.parent?.toString() !== currentUser.id) {
        throw new ErrorResponse('Not authorized to update this payment', 403);
      }
    }

    const current = payment.status as PAYMENT_STATUS;
    const allowed: Record<PAYMENT_STATUS, (PAYMENT_STATUS | string)[]> = {
      [PAYMENT_STATUS.PENDING]: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.OVERDUE],
      [PAYMENT_STATUS.OVERDUE]: [PAYMENT_STATUS.PAID],
      [PAYMENT_STATUS.PAID]: [],
    };

    if (current === newStatus) return payment;
    if (!allowed[current]?.includes(newStatus)) {
      throw new ErrorResponse('Invalid payment status transition', 400);
    }

    // Update payment status and related fields
    payment.status = newStatus as any;
    if (newStatus === PAYMENT_STATUS.PAID) {
      payment.paymentDate = new Date();
      if (paymentMethod) payment.paymentMethod = paymentMethod as any;
      if (transactionId) payment.transactionId = transactionId;
      if (notes) payment.notes = notes;
      if (paidBy) payment.paidBy = new mongoose.Types.ObjectId(paidBy) as any;
    }
    
    await payment.save({ session });
    
    // Send notification
    try {
      await createNotificationWithPreferences({
        recipient: payment.tutor as any,
        type: 'PAYMENT',
        title: newStatus === PAYMENT_STATUS.PAID ? 'Payment Received' : 'Payment Status Updated',
        message:
          newStatus === PAYMENT_STATUS.PAID
            ? `Your payment of INR ${payment.amount} has been marked as PAID.`
            : `Your payment status changed to ${newStatus}.`,
      });
    } catch (e) {
      logError(`Failed to create payment status notification: ${String(e)}`);
    }

    // Populate payment details
    await payment.populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

    // Log manager activity if payment is marked as paid
    if (newStatus === PAYMENT_STATUS.PAID && paidBy) {
      try {
        await Manager.findOneAndUpdate(
          { user: new mongoose.Types.ObjectId(paidBy) },
          { $inc: { paymentsProcessed: 1, revenueGenerated: payment.amount || 0 } },
          { session }
        );
        
        await logManagerActivity(
          paidBy,
          MANAGER_ACTION_TYPE.UPDATE_PAYMENT_STATUS,
          `Marked payment as PAID for tutor ${(payment as any).tutor?.name || ''}, amount ${payment.amount}`,
          { 
            entityType: 'Payment', 
            entityId: String(payment._id), 
            entityName: `Payment-${String(payment._id)}` 
          },
          { 
            amount: payment.amount, 
            paymentMethod, 
            transactionId, 
            oldStatus: current, 
            newStatus 
          }
        );
      } catch (e) {
        logError(`Failed to log manager activity: ${String(e)}`);
      }
    }

    await session.commitTransaction();
    return payment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const updatePayment = async (
  paymentId: string,
  updateData: Partial<{ amount: number; dueDate: Date; notes: string }>
) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ErrorResponse('Payment not found', 404);
  if (String(payment.status) !== PAYMENT_STATUS.PENDING) {
    throw new ErrorResponse('Cannot update paid/overdue payment', 400);
  }
  if (typeof updateData.amount !== 'undefined') payment.amount = updateData.amount;
  if (typeof updateData.dueDate !== 'undefined') payment.dueDate = new Date(updateData.dueDate);
  if (typeof updateData.notes !== 'undefined') payment.notes = updateData.notes;
  await payment.save();

  await payment.populate([
    { path: 'finalClass' },
    { path: 'attendance' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
    { path: 'paidBy', select: 'name email' },
  ]);

  return payment;
};

export const deletePayment = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ErrorResponse('Payment not found', 404);
  if (String(payment.status) !== PAYMENT_STATUS.PENDING) {
    throw new ErrorResponse('Cannot delete paid/overdue payment', 400);
  }
  await Payment.findByIdAndDelete(paymentId);
  return { success: true };
};

export const getPaymentsByTutor = async (
  tutorUserId: string,
  status?: PAYMENT_STATUS | string,
  fromDate?: Date,
  toDate?: Date
) => {
  if (!mongoose.isValidObjectId(tutorUserId)) {
    return { payments: [], statistics: { totalAmount: 0, paidAmount: 0, pendingAmount: 0 } };
  }
  const query: any = { tutor: new mongoose.Types.ObjectId(tutorUserId) };
  if (status) query.status = status;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  const payments = await Payment.find(query)
    .sort({ createdAt: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paidAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PAID).reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PENDING).reduce((s, p) => s + (p.amount || 0), 0);

  return { payments, statistics: { totalAmount, paidAmount, pendingAmount } };
};

export const getPaymentsByParent = async (
  parentUserId: string,
  status?: PAYMENT_STATUS | string,
  fromDate?: Date,
  toDate?: Date
) => {
  if (!mongoose.isValidObjectId(parentUserId)) {
    return { payments: [], statistics: { totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0 } };
  }

  const classes = await FinalClass.find({ parent: new mongoose.Types.ObjectId(parentUserId) }).select('_id');
  const classIds = classes.map((c) => c._id);
  if (!classIds.length) {
    return { payments: [], statistics: { totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0 } };
  }

  const query: any = { finalClass: { $in: classIds } };
  if (status) query.status = status;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  const payments = await Payment.find(query)
    .sort({ createdAt: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paidAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PAID).reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PENDING).reduce((s, p) => s + (p.amount || 0), 0);
  const overdueAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.OVERDUE).reduce((s, p) => s + (p.amount || 0), 0);

  return { payments, statistics: { totalAmount, paidAmount, pendingAmount, overdueAmount } };
};

export const getPaymentsByClass = async (finalClassId: string, status?: PAYMENT_STATUS | string) => {
  const query: any = { finalClass: new mongoose.Types.ObjectId(finalClassId) };
  if (status) query.status = status;
  const payments = await Payment.find(query)
    .sort({ createdAt: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paidAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PAID).reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = payments.filter((p) => String(p.status) === PAYMENT_STATUS.PENDING).reduce((s, p) => s + (p.amount || 0), 0);

  return { payments, statistics: { totalAmount, paidAmount, pendingAmount } };
};

export const markOverduePayments = async () => {
  const now = new Date();
  const res = await Payment.updateMany({ status: PAYMENT_STATUS.PENDING, dueDate: { $lt: now } }, { $set: { status: PAYMENT_STATUS.OVERDUE } });
  const overduePayments = await Payment.find({ status: PAYMENT_STATUS.OVERDUE, dueDate: { $lt: now } });
  try {
    for (const p of overduePayments) {
      await createNotificationWithPreferences({
        recipient: p.tutor as any,
        type: 'PAYMENT',
        title: 'Payment Overdue',
        message: `Your payment of INR ${p.amount} is overdue.`,
      });
    }
  } catch (e) {
    logError(`Failed to notify overdue payments: ${String(e)}`);
  }
  return res.modifiedCount || 0;
};

export const getPaymentStatistics = async (fromDate?: Date, toDate?: Date, tutorId?: string) => {
  const match: any = {};
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(toDate);
  }
  if (tutorId) match.tutor = new mongoose.Types.ObjectId(tutorId);

  const pipeline: any[] = [
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        amount: { $sum: '$amount' },
      },
    },
  ];

  const statusAgg = await Payment.aggregate(pipeline);
  const totals = statusAgg.reduce(
    (acc: any, cur: any) => {
      acc.count += cur.count;
      acc.totalAmount += cur.amount || 0;
      if (cur._id === PAYMENT_STATUS.PAID) acc.paidAmount = cur.amount || 0;
      if (cur._id === PAYMENT_STATUS.PENDING) acc.pendingAmount = cur.amount || 0;
      if (cur._id === PAYMENT_STATUS.OVERDUE) acc.overdueAmount = cur.amount || 0;
      acc.paymentsByStatus[cur._id] = cur.count;
      return acc;
    },
    { count: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0, paymentsByStatus: {} as Record<string, number> }
  );

  const avgAgg = await Payment.aggregate([
    { $match: match },
    { $group: { _id: null, avg: { $avg: '$amount' } } },
  ]);

  const methodsAgg = await Payment.aggregate([
    { $match: match },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
  ]);

  const paymentsByMethod: Record<string, number> = {};
  methodsAgg.forEach((m) => {
    const key = m._id || 'UNKNOWN';
    paymentsByMethod[key] = m.count;
  });

  return {
    totalPayments: totals.count,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    pendingAmount: totals.pendingAmount,
    overdueAmount: totals.overdueAmount,
    averagePaymentAmount: avgAgg[0]?.avg || 0,
    paymentsByStatus: totals.paymentsByStatus,
    paymentsByMethod,
  };
};

export const generatePaymentReport = async (filters: {
  tutorId?: string;
  finalClassId?: string;
  status?: PAYMENT_STATUS | string;
  fromDate?: Date;
  toDate?: Date;
}) => {
  const query: any = {};
  if (filters.tutorId) query.tutor = new mongoose.Types.ObjectId(filters.tutorId);
  if (filters.finalClassId) query.finalClass = new mongoose.Types.ObjectId(filters.finalClassId);
  if (filters.status) query.status = filters.status;
  if (filters.fromDate || filters.toDate) {
    query.createdAt = {};
    if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
  }

  const payments = await Payment.find(query)
    .sort({ createdAt: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

  const data = payments.map((p) => ({
    id: String(p._id),
    classId: String((p.finalClass as any)?._id || ''),
    attendanceId: String((p.attendance as any)?._id || ''),
    tutorName: (p as any).tutor?.name || '',
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    paymentMethod: p.paymentMethod || '',
    transactionId: p.transactionId || '',
    paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString() : '',
    dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : '',
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
  }));

  return data;
};

export default {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  updatePayment,
  deletePayment,
  getPaymentsByTutor,
  getPaymentsByClass,
  markOverduePayments,
  getPaymentStatistics,
  generatePaymentReport,
  sendPaymentReminder,
  getPaymentsByParent,
};
