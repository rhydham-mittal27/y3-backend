import mongoose from 'mongoose';
import Test from '../models/Test';
import FinalClass from '../models/FinalClass';
import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { TEST_STATUS, FINAL_CLASS_STATUS } from '../config/constants';

export const scheduleTest = async (params: {
  finalClassId: string;
  testDate: Date;
  testTime: string;
  notes?: string;
  scheduledBy: string;
}) => {
  const { finalClassId, testDate, testTime, notes, scheduledBy } = params;

  const cls = await FinalClass.findById(finalClassId);
  if (!cls) throw new ErrorResponse('Final class not found', 404);
  if (String(cls.status) !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Class must be ACTIVE to schedule a test', 400);
  }

  const existing = await Test.findOne({
    finalClass: new mongoose.Types.ObjectId(finalClassId),
    testDate: new Date(testDate),
    status: { $ne: TEST_STATUS.CANCELLED },
  });
  if (existing) throw new ErrorResponse('Test already scheduled for this date', 409);

  const test = await Test.create({
    finalClass: cls._id,
    testDate: new Date(testDate),
    testTime,
    tutor: cls.tutor,
    coordinator: cls.coordinator,
    scheduledBy: new mongoose.Types.ObjectId(scheduledBy),
    notes,
    status: TEST_STATUS.SCHEDULED,
  });

  await test.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'scheduledBy', select: 'name email' },
  ]);

  await Notification.create({
    recipient: test.tutor,
    type: 'GENERAL',
    title: 'Test Scheduled',
    message: `A test has been scheduled for ${new Date(test.testDate).toDateString()}. Please prepare accordingly.`,
  });

  return test;
};

export const getAllTests = async (args: {
  page: number;
  limit: number;
  finalClassId?: string;
  status?: TEST_STATUS | string;
  tutorId?: string;
  coordinatorId?: string;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const { page, limit, finalClassId, status, tutorId, coordinatorId, fromDate, toDate, sortBy, sortOrder } = args;
  const query: any = {};
  if (finalClassId) query.finalClass = new mongoose.Types.ObjectId(finalClassId);
  if (status) query.status = status;
  if (tutorId) query.tutor = new mongoose.Types.ObjectId(tutorId);
  if (coordinatorId) query.coordinator = new mongoose.Types.ObjectId(coordinatorId);
  if (fromDate || toDate) {
    query.testDate = {};
    if (fromDate) query.testDate.$gte = new Date(fromDate);
    if (toDate) query.testDate.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'testDate';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [tests, total] = await Promise.all([
    Test.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'finalClass' },
        { path: 'tutor', select: 'name email phone' },
        { path: 'coordinator', select: 'name email phone' },
        { path: 'scheduledBy', select: 'name email' },
        { path: 'reportSubmittedBy', select: 'name email' },
        { path: 'cancelledBy', select: 'name email' },
      ]),
    Test.countDocuments(query),
  ]);

  return { tests, total, page, limit };
};

export const getTestById = async (testId: string) => {
  const test = await Test.findById(testId).populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'scheduledBy', select: 'name email' },
    { path: 'reportSubmittedBy', select: 'name email' },
    { path: 'cancelledBy', select: 'name email' },
  ]);
  if (!test) throw new ErrorResponse('Test not found', 404);
  return test;
};

export const getTestsByClass = async (finalClassId: string, status?: TEST_STATUS | string) => {
  const query: any = { finalClass: new mongoose.Types.ObjectId(finalClassId) };
  if (status) query.status = status;
  const tests = await Test.find(query)
    .sort({ testDate: -1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'scheduledBy', select: 'name email' },
    ]);
  return tests;
};

export const updateTestStatus = async (testId: string, status: TEST_STATUS, userId: string) => {
  const test = await Test.findById(testId);
  if (!test) throw new ErrorResponse('Test not found', 404);

  if (String(test.status) === TEST_STATUS.CANCELLED) {
    throw new ErrorResponse('Cannot change status of a cancelled test', 400);
  }
  if (String(test.status) === TEST_STATUS.REPORT_SUBMITTED && status !== TEST_STATUS.REPORT_SUBMITTED) {
    throw new ErrorResponse('Report already submitted, status cannot be changed', 400);
  }

  test.status = status as any;
  if (status === TEST_STATUS.COMPLETED) {
    test.completedAt = new Date();
  }

  await test.save();
  await test.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
  ]);
  return test;
};

export const submitTestReport = async (
  testId: string,
  report: { feedback: string; strengths: string; areasOfImprovement: string; studentPerformance: string; recommendations: string },
  tutorUserId: string
) => {
  const test = await Test.findById(testId);
  if (!test) throw new ErrorResponse('Test not found', 404);
  if (String(test.tutor) !== String(tutorUserId)) throw new ErrorResponse('Not authorized to submit report', 403);
  if (![TEST_STATUS.SCHEDULED, TEST_STATUS.COMPLETED].includes(test.status as any)) {
    throw new ErrorResponse('Test must be SCHEDULED or COMPLETED to submit report', 400);
  }

  test.report = report as any;
  test.status = TEST_STATUS.REPORT_SUBMITTED as any;
  test.reportSubmittedBy = new mongoose.Types.ObjectId(tutorUserId) as any;
  test.reportSubmittedAt = new Date();
  await test.save();

  await test.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'reportSubmittedBy', select: 'name email' },
  ]);

  await Notification.create({
    recipient: test.coordinator,
    type: 'GENERAL',
    title: 'Test Report Submitted',
    message: 'Tutor has submitted test report for the class.',
  });

  return test;
};

export const updateTest = async (
  testId: string,
  updateData: Partial<{ testDate: Date; testTime: string; notes: string }>,
  coordinatorUserId: string
) => {
  const test = await Test.findById(testId);
  if (!test) throw new ErrorResponse('Test not found', 404);
  if (String(test.coordinator) !== String(coordinatorUserId)) throw new ErrorResponse('Not authorized to update test', 403);
  if (String(test.status) !== TEST_STATUS.SCHEDULED) throw new ErrorResponse('Only SCHEDULED test can be updated', 400);

  const prevDate = test.testDate;
  const prevTime = test.testTime;

  if (updateData.testDate) test.testDate = new Date(updateData.testDate);
  if (typeof updateData.testTime !== 'undefined') test.testTime = updateData.testTime;
  if (typeof updateData.notes !== 'undefined') test.notes = updateData.notes;
  await test.save();

  if ((updateData.testDate && new Date(updateData.testDate).getTime() !== new Date(prevDate).getTime()) ||
      (typeof updateData.testTime !== 'undefined' && updateData.testTime !== prevTime)) {
    await Notification.create({
      recipient: test.tutor,
      type: 'GENERAL',
      title: 'Test Updated',
      message: `Test schedule updated to ${new Date(test.testDate).toDateString()} at ${test.testTime}.`,
    });
  }

  await test.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
  ]);

  return test;
};

export const cancelTest = async (testId: string, cancellationReason: string, coordinatorUserId: string) => {
  const test = await Test.findById(testId);
  if (!test) throw new ErrorResponse('Test not found', 404);
  if (String(test.coordinator) !== String(coordinatorUserId)) throw new ErrorResponse('Not authorized to cancel test', 403);
  if ([TEST_STATUS.CANCELLED, TEST_STATUS.REPORT_SUBMITTED].includes(test.status as any)) {
    throw new ErrorResponse('Cannot cancel this test in current status', 400);
  }

  test.status = TEST_STATUS.CANCELLED as any;
  test.cancellationReason = cancellationReason;
  test.cancelledBy = new mongoose.Types.ObjectId(coordinatorUserId) as any;
  test.cancelledAt = new Date();
  await test.save();

  await Notification.create({
    recipient: test.tutor,
    type: 'GENERAL',
    title: 'Test Cancelled',
    message: `Test scheduled for ${new Date(test.testDate).toDateString()} has been cancelled: ${cancellationReason}`,
  });

  await test.populate([
    { path: 'finalClass' },
    { path: 'tutor', select: 'name email phone' },
    { path: 'coordinator', select: 'name email phone' },
    { path: 'cancelledBy', select: 'name email' },
  ]);

  return test;
};

export const deleteTest = async (testId: string) => {
  const test = await Test.findById(testId);
  if (!test) throw new ErrorResponse('Test not found', 404);
  if (String(test.status) !== TEST_STATUS.SCHEDULED) {
    throw new ErrorResponse('Only SCHEDULED tests can be deleted', 400);
  }
  await Test.findByIdAndDelete(testId);
  return { success: true };
};

export const getTestsForCoordinator = async (coordinatorUserId: string, status?: TEST_STATUS | string) => {
  const query: any = { coordinator: new mongoose.Types.ObjectId(coordinatorUserId) };
  if (status) query.status = status;
  const tests = await Test.find(query)
    .sort({ testDate: 1 })
    .populate([
      { path: 'finalClass' },
      { path: 'tutor', select: 'name email phone' },
      { path: 'coordinator', select: 'name email phone' },
      { path: 'scheduledBy', select: 'name email' },
    ]);
  return tests;
};

export default {
  scheduleTest,
  getAllTests,
  getTestById,
  getTestsByClass,
  updateTestStatus,
  submitTestReport,
  updateTest,
  cancelTest,
  deleteTest,
  getTestsForCoordinator,
};
