import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import FinalClass from '../models/FinalClass';
import Student from '../models/Student';
import ErrorResponse from '../utils/errorResponse';
import { PAYMENT_STATUS, PAYMENT_METHOD, PAYMENT_TYPE, ATTENDANCE_STATUS, MANAGER_ACTION_TYPE } from '../config/constants';
import logger, { logError } from '../utils/logger';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import { createNotificationWithPreferences } from './notificationService';

const DEFAULT_DUE_DAYS = 7;

export const createManualPayment = async (data: {
  tutor?: string;
  amount: number;
  paymentType: PAYMENT_TYPE;
  finalClass?: string;
  dueDate: Date;
  notes?: string;
  createdBy: string;
  currency?: string;
}) => {
  const payment = await Payment.create({
    tutor: data.tutor ? new mongoose.Types.ObjectId(data.tutor) : undefined,
    amount: data.amount,
    paymentType: data.paymentType,
    finalClass: data.finalClass ? new mongoose.Types.ObjectId(data.finalClass) : undefined,
    dueDate: new Date(data.dueDate),
    notes: data.notes,
    createdBy: new mongoose.Types.ObjectId(data.createdBy),
    status: PAYMENT_STATUS.PENDING,
    currency: data.currency || 'INR',
  });

  return await payment.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
  ]);
};

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

  // 1. Determine Students & Fees
  let studentsDetails: { studentId: string; fee: number }[] = [];
  
  // Check if it's a group class (GroupClass linked or studentDetails array present)
  // If we have associated students in the class, we should use them
  const associatedStudents = await Student.find({ finalClass: finalClass._id });
  
  if (associatedStudents.length > 1) {
    // IT IS A GROUP CLASS
    // Try to match students with their specific fees from lead.studentDetails
    const leadDetails = lead?.studentDetails || [];
    
    studentsDetails = associatedStudents.map(student => {
      // Find matching detail by name (fallback)
      const detail = leadDetails.find((d: any) => d.name === student.name);
      return {
        studentId: String(student._id),
        fee: detail?.fees || (lead.paymentAmount / associatedStudents.length) || 0 // Fallback to even split if no specific fee
      };
    });
  } else if (associatedStudents.length === 1) {
    // SINGLE STUDENT
    studentsDetails = [{
      studentId: String(associatedStudents[0]._id),
      fee: lead?.paymentAmount || (cls.monthlyFees) || 0
    }];
  } else {
    // Fallback if no students found yet (should not happen if converted properly)
    // Just use the Class Lead data directly if possible, or return null
     return null; 
  }

  const results: any[] = [];
  const dueDate = new Date(cls.startDate || Date.now());
  dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

  // 2. Create FEES_COLLECTED payments (One per student)
  for (const item of studentsDetails) {
    if (item.fee > 0) {
      const existing = await Payment.findOne({ 
        finalClass: finalClass._id, 
        student: new mongoose.Types.ObjectId(item.studentId),
        paymentType: PAYMENT_TYPE.FEES_COLLECTED,
        attendance: { $exists: false } 
      });

      if (!existing) {
        const payment = await Payment.create({
          finalClass: finalClass._id,
          groupClass: cls.groupClass, // If applicable
          student: new mongoose.Types.ObjectId(item.studentId),
          tutor: cls.tutor,
          amount: item.fee,
          currency: 'INR',
          status: PAYMENT_STATUS.PENDING,
          paymentType: PAYMENT_TYPE.FEES_COLLECTED,
          dueDate,
          createdBy: new mongoose.Types.ObjectId(createdBy),
          notes: 'Advance class fees',
        });
        results.push(payment);
      } else {
        results.push(existing);
      }
    }
  }

  // 3. Create TUTOR_PAYOUT payment (One for the tutor)
  // Only if tutor fees are defined
  let tutorPayoutAmount = lead?.tutorFees || (cls.tutorMonthlyFees) || 0;
  
  if (tutorPayoutAmount > 0) {
      const existingPayout = await Payment.findOne({ 
        finalClass: finalClass._id, 
        paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
        attendance: { $exists: false } 
      });

      if (!existingPayout) {
        const payout = await Payment.create({
          finalClass: finalClass._id,
          groupClass: cls.groupClass,
          tutor: cls.tutor,
          amount: tutorPayoutAmount,
          currency: 'INR',
          status: PAYMENT_STATUS.PENDING, // Payout is pending until admin pays
          paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
          dueDate, // Maybe different due date for payout? Using same for now.
          createdBy: new mongoose.Types.ObjectId(createdBy),
          notes: 'Advance tutor payout',
        });
        results.push(payout);
      } else {
        results.push(existingPayout);
      }
  }

  return results.length > 0 ? results : null;
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
  paymentType?: string;
  tutorId?: string;
  finalClassId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, status, paymentType, tutorId, finalClassId, fromDate, toDate, sortBy, sortOrder } = args;
  const query: any = {};
  if (status) query.status = status;
  if (paymentType) query.paymentType = paymentType;
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
        { path: 'attendanceSheet' },
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
    { path: 'attendanceSheet' },
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
  currentUser?: { id: string; role: string },
  paymentProof?: string
) => {
  // Check if transactions are supported (Replica Set)
  // Note: Reliable check for replica set can be tricky. Simpler approach: Try transaction, fallback if failed.
  
  // Implementation with fallback
  const performUpdate = async (session: mongoose.ClientSession | null) => {
    // Find payment with necessary population
    const payment = await Payment.findById(paymentId)
      .populate('finalClass')
      .populate('tutor')
      .session(session);

    if (!payment) {
      throw new ErrorResponse('Payment not found', 404);
    }

    // Check availability logic...
    if (currentUser?.role === 'parent') {
      const finalClass = await FinalClass.findById(payment.finalClass)
        .populate('student')
        .session(session);
      // @ts-ignore
      if (finalClass?.student?.parent?.toString() !== currentUser.id) {
        throw new ErrorResponse('Not authorized to update this payment', 403);
      }
    }

    if (currentUser?.role === 'student') {
      const student = await Student.findById(currentUser.id).session(session);
      if (!student || String(student.finalClass) !== String(payment.finalClass)) {
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

    payment.status = newStatus as any;
    if (newStatus === PAYMENT_STATUS.PAID) {
      payment.paymentDate = new Date();
      if (paymentMethod) payment.paymentMethod = paymentMethod as any;
      if (transactionId) payment.transactionId = transactionId;
      if (notes) payment.notes = notes;
      if (paidBy) payment.paidBy = new mongoose.Types.ObjectId(paidBy) as any;
      if (paymentProof) payment.paymentProof = paymentProof;
    }
    
    await payment.save({ session });
    
    // Notifications (non-critical, can be outside transaction but keeping inside for simplicity if session exists)
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

    await payment.populate([
      { path: 'finalClass' },
      { path: 'attendance' },
      { path: 'attendanceSheet' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'createdBy', select: 'name email' },
      { path: 'paidBy', select: 'name email' },
    ]);

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

    return payment;
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await performUpdate(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    // If transaction is not supported (standalone mongo), retry without transaction
    if (error.message && (error.message.includes('Transactions are not supported') || error.code === 20)) {
       await session.abortTransaction(); // Cleanup failed transaction attempt
       logError('Transactions not supported. Retrying without transaction.');
       return await performUpdate(null);
    }
    
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

  // Month start for current month stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const pipeline: any[] = [
    { $match: match },
    {
      $facet: {
        totalClasses: [
          { $group: { _id: '$finalClass' } },
          { $count: 'count' }
        ],
        financials: [
          { $match: { status: PAYMENT_STATUS.PAID } },
          {
            $group: {
              _id: null,
              feesCollected: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.FEES_COLLECTED] }, '$amount', 0]
                }
              },
              tutorPayouts: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.TUTOR_PAYOUT] }, '$amount', 0]
                }
              },
              miscellaneous: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.MISCELLANEOUS] }, '$amount', 0]
                }
              }
            }
          }
        ],
        monthlyFinancials: [
          { 
            $match: { 
              status: PAYMENT_STATUS.PAID,
              createdAt: { $gte: startOfMonth }
            } 
          },
          {
            $group: {
              _id: null,
              feesCollected: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.FEES_COLLECTED] }, '$amount', 0]
                }
              },
              tutorPayouts: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.TUTOR_PAYOUT] }, '$amount', 0]
                }
              },
              miscellaneous: {
                $sum: {
                  $cond: [{ $eq: ['$paymentType', PAYMENT_TYPE.MISCELLANEOUS] }, '$amount', 0]
                }
              }
            }
          }
        ]
      }
    }
  ];

  const [result] = await Payment.aggregate(pipeline);
  
  const totalClasses = result.totalClasses[0]?.count || 0;
  const financials = result.financials[0] || { feesCollected: 0, tutorPayouts: 0, miscellaneous: 0 };
  const feesCollected = financials.feesCollected || 0;
  const tutorPayouts = financials.tutorPayouts || 0;
  const miscellaneous = financials.miscellaneous || 0;
  const serviceCharge = feesCollected - tutorPayouts;
  const netProfit = serviceCharge - miscellaneous;

  const monthly = result.monthlyFinancials[0] || { feesCollected: 0, tutorPayouts: 0, miscellaneous: 0 };
  const monthlyFees = monthly.feesCollected || 0;
  const monthlyPayouts = monthly.tutorPayouts || 0;
  const monthlyMisc = monthly.miscellaneous || 0;
  const monthlyServiceCharge = monthlyFees - monthlyPayouts;
  const monthlyNetProfit = monthlyServiceCharge - monthlyMisc;

  return {
    totalClasses,
    feesCollected,
    totalPayouts: tutorPayouts,
    miscellaneous,
    serviceCharge,
    netProfit,
    monthly: {
      feesCollected: monthlyFees,
      tutorPayouts: monthlyPayouts,
      miscellaneous: monthlyMisc,
      serviceCharge: monthlyServiceCharge,
      netProfit: monthlyNetProfit
    }
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

export const getPaymentFilterOptions = async () => {
  const classes = await Payment.aggregate([
    {
      $group: {
        _id: '$finalClass'
      }
    },
    {
      $lookup: {
        from: 'finalclasses',
        localField: '_id',
        foreignField: '_id',
        as: 'classDetails'
      }
    },
    { $unwind: '$classDetails' },
    {
      $project: {
        _id: 1,
        // Assuming className is customId or similar identifier based on request "class id - student names"
        // FinalClass has className (unique), studentName
        label: { $concat: ['$classDetails.className', ' - ', '$classDetails.studentName'] }
      }
    },
    { $sort: { label: 1 } }
  ]);

  return { classes };
};

export const createPaymentForSheet = async (sheetId: string, createdBy: string) => {
  const AttendanceSheet = require('../models/AttendanceSheet').default;
  const sheet = await AttendanceSheet.findById(sheetId).populate([
    { path: 'finalClass' },
    { path: 'groupClass' }, // Populate Group Class
  ]);
  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  
  // Existing logic...
  if (sheet.status !== 'APPROVED') {
    throw new ErrorResponse('Attendance sheet is not approved', 400);
  }

  const existing = await Payment.findOne({ attendanceSheet: new mongoose.Types.ObjectId(sheetId) });
  if (existing) throw new ErrorResponse('Payment already exists for this attendance sheet', 409);

  let entity: any;
  let tutorRate = 0;
  let paymentData: any = {};
  
  if (sheet.sheetType === 'GROUP' || sheet.groupClass) {
       const group = sheet.groupClass;
       if (!group) throw new ErrorResponse('Group class not found for sheet', 404);
       entity = group;
       tutorRate = group.tutorRatePerSession || 0;
       paymentData.groupClass = group._id;
  } else {
       const cls = sheet.finalClass;
       if (!cls) throw new ErrorResponse('Final class not found for sheet', 404);
       entity = cls;
       // Tutor Rate Selection
       tutorRate = cls.tutorRatePerSession || (cls.classLead as any)?.tutorFees || 0;
       paymentData.finalClass = cls._id;
  }
  
  if (tutorRate <= 0) {
    logger.warn(`Tutor rate per session not found for class/group ${entity._id}, using 0 for calculation`);
  }

  // Total amount = tutorRate * number of approved/verified sessions
  const sessionsVerified = (sheet.records || []).filter(
    (a: any) => 
      String(a.status) === ATTENDANCE_STATUS.APPROVED || 
      String(a.status) === ATTENDANCE_STATUS.COORDINATOR_APPROVED ||
      String(a.status) === ATTENDANCE_STATUS.PARENT_APPROVED
  );
  
  const amount = tutorRate * sessionsVerified.length;
  // ... rest of logic
  
  /* 
     Constructing Payment Object 
  */
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

  const payment = await Payment.create({
    ...paymentData, // finalClass or groupClass
    attendanceSheet: sheet._id,
    tutor: entity.tutor,
    amount,
    currency: 'INR',
    status: PAYMENT_STATUS.PENDING,
    paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
    dueDate,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    notes: `Monthly payout for ${sheet.periodLabel}`,
  });

  await payment.populate([
    { path: 'finalClass' },
    { path: 'groupClass' },
    { path: 'attendanceSheet' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
  ]);

  try {
    await createNotificationWithPreferences({
      recipient: entity.tutor as any,
      type: 'PAYMENT',
      title: 'Monthly Payment Created',
      message: `A payment of INR ${amount} is created for your approved monthly attendance sheet (${sheet.periodLabel}). Due by ${dueDate.toDateString()}.`,
    });
  } catch (e) {
    logError(`Failed to create payment notification: ${String(e)}`);
  }

  return payment;
};

export const createCyclePayments = async (sheetId: string, createdBy: string) => {
  const AttendanceSheet = require('../models/AttendanceSheet').default;
  const sheet = await AttendanceSheet.findById(sheetId).populate({
    path: 'finalClass',
    populate: { path: 'classLead' }
  });

  if (!sheet) throw new ErrorResponse('Attendance sheet not found', 404);
  const cls = sheet.finalClass as any;
  if (!cls) throw new ErrorResponse('Final class not found for sheet', 404);

  const numSessions = sheet.totalSessionsPlanned || 0;
  if (numSessions <= 0) return;

  // NEW: Skip Fees Collected for Cycle 1 (covered by Advance Payment)
  if (sheet.cycleNumber === 1) {
    // logger.info(`Skipping cycle payment creation for Cycle 1 of sheet ${sheet._id}`);
    return;
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const parentRate = cls.ratePerSession || 0;

  // Check for associated students to determine if it's a Group Class (Legacy FinalClass style)
  const students = await Student.find({ finalClass: cls._id });

  if (students.length > 1) {
    // --- GROUP CLASS LOGIC ---
    const monthlyFees = cls.monthlyFees || 0;
    // Avoid division by zero
    const perStudentFee = students.length > 0 ? Math.round(monthlyFees / students.length) : 0;
    
    if (perStudentFee > 0) {
      for (const student of students) {
        // Create payment for each student
        const paymentData: any = {
          finalClass: cls._id,
          attendanceSheet: sheet._id,
          student: student._id,
          tutor: cls.tutor,
          amount: perStudentFee,
          currency: 'INR',
          status: PAYMENT_STATUS.PENDING,
          paymentType: PAYMENT_TYPE.FEES_COLLECTED,
          dueDate,
          createdBy: new mongoose.Types.ObjectId(createdBy),
          notes: `Monthly fees for ${sheet.periodLabel} (Group Split)`,
        };
        await Payment.create(paymentData);
      }
    }
  } else {
    // --- SINGLE CLASS LOGIC ---
    // Prefer monthlyFees if available, otherwise calculate from rate * sessions
    const parentAmount = (cls.monthlyFees && cls.monthlyFees > 0) 
      ? cls.monthlyFees 
      : (parentRate * numSessions);

    // 1. Fee Collected (Parent -> Coordinator/Office)
    if (parentAmount > 0) {
      await Payment.create({
        finalClass: cls._id,
        attendanceSheet: sheet._id,
        tutor: cls.tutor,
        amount: parentAmount,
        currency: 'INR',
        status: PAYMENT_STATUS.PENDING,
        paymentType: PAYMENT_TYPE.FEES_COLLECTED,
        dueDate,
        createdBy: new mongoose.Types.ObjectId(createdBy),
        notes: `Monthly fees for ${sheet.periodLabel}`,
      });
    }
  }

  // 2. Tutor Payout (Coordinator/Office -> Tutor)
  // DEPRECATED: Payouts are now generated upon sheet verification (approval) based on actual verified sessions.
  // See createPaymentForSheet
  /*
  if (tutorAmount > 0) {
    await Payment.create({
      finalClass: cls._id,
      attendanceSheet: sheet._id,
      tutor: cls.tutor,
      amount: tutorAmount,
      currency: 'INR',
      status: PAYMENT_STATUS.PENDING,
      paymentType: PAYMENT_TYPE.TUTOR_PAYOUT,
      dueDate,
      createdBy: new mongoose.Types.ObjectId(createdBy),
      notes: `Monthly payout for ${sheet.periodLabel}`,
    });
  }
  */
};


