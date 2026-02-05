import mongoose from 'mongoose';
import Test from '../models/Test';
import FinalClass from '../models/FinalClass';
import { createNotificationWithPreferences } from './notificationService';
import ErrorResponse from '../utils/errorResponse';
import { TEST_STATUS, FINAL_CLASS_STATUS, USER_ROLES } from '../config/constants';
import { uploadFileToS3 } from '../services/s3Service';
import { S3_CONFIG } from '../config/s3';

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

  await createNotificationWithPreferences({
    recipient: test.tutor as any,
    type: 'GENERAL',
    title: 'Test Scheduled',
    message: `A test has been scheduled for ${new Date(test.testDate).toDateString()}. Please prepare accordingly.`,
  });

  return test;
};

export const uploadTestAnswerSheet = async (params: {
  testId: string;
  tutorUserId: string;
  callerRole: string;
  file: any;
  topicName?: string;
  totalMarks?: number;
  obtainedMarks?: number;
}) => {
  const { testId, tutorUserId, callerRole, file, topicName, totalMarks, obtainedMarks } = params;

  if (!file || !file.buffer) {
    throw new ErrorResponse('Invalid file upload', 400);
  }

  const test = await Test.findById(testId).populate([{ path: 'finalClass' }, { path: 'tutor' }]);
  if (!test) {
    throw new ErrorResponse('Test not found', 404);
  }

  // Ensure tutor owns this test OR caller is a coordinator
  const tutorIdFromTest = (test as any).tutor?._id ? (test as any).tutor._id : test.tutor;
  const isTutorOwner = String(tutorIdFromTest) === String(tutorUserId);
  const isCoordinator = callerRole === USER_ROLES.COORDINATOR;
  if (!isTutorOwner && !isCoordinator) {
    throw new ErrorResponse('Not authorized to upload answer sheet for this test', 403);
  }

  const finalClass: any = test.finalClass;
  if (!finalClass || String(finalClass.status) !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Can only upload reports for ACTIVE classes', 400);
  }

  if (typeof totalMarks === 'number' && totalMarks <= 0) {
    throw new ErrorResponse('Total marks must be greater than zero', 400);
  }
  if (
    typeof totalMarks === 'number' &&
    typeof obtainedMarks === 'number' &&
    (obtainedMarks < 0 || obtainedMarks > totalMarks)
  ) {
    throw new ErrorResponse('Obtained marks must be between 0 and total marks', 400);
  }

  const buffer: Buffer = file.buffer;
  const originalname: string = file.originalname || 'answer-sheet';
  const mimetype: string = file.mimetype || 'application/octet-stream';

  let uploadResult: { key: string; url: string; bucket: string };
  try {
    uploadResult = await uploadFileToS3(
      buffer,
      originalname,
      mimetype,
      S3_CONFIG.FOLDERS.ANSWER_SHEETS
    );
  } catch (err: any) {
    throw new ErrorResponse('Failed to upload answer sheet to storage', 500);
  }

  if (typeof topicName === 'string' && topicName.trim().length > 0) {
    (test as any).topicName = topicName.trim();
  }
  if (typeof totalMarks === 'number' && !Number.isNaN(totalMarks)) {
    (test as any).totalMarks = totalMarks;
  }
  if (typeof obtainedMarks === 'number' && !Number.isNaN(obtainedMarks)) {
    (test as any).obtainedMarks = obtainedMarks;
  }

  (test as any).answerSheetUrl = uploadResult.url;
  (test as any).answerSheetName = originalname;
  (test as any).answerSheetMimeType = mimetype;
  (test as any).answerSheetS3Key = uploadResult.key;

  // Mark report submitted
  test.status = TEST_STATUS.REPORT_SUBMITTED as any;

  await test.save();

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

export const uploadTestPaper = async (params: {
  testId: string;
  tutorUserId: string;
  callerRole: string;
  file: any;
  totalMarks?: number;
  durationMinutes?: number;
}) => {
  const { testId, tutorUserId, callerRole, file, totalMarks, durationMinutes } = params;

  if (!file || !file.buffer) {
    throw new ErrorResponse('Invalid file upload', 400);
  }

  const test = await Test.findById(testId).populate([{ path: 'finalClass' }, { path: 'tutor' }]);
  if (!test) {
    throw new ErrorResponse('Test not found', 404);
  }

  // Ensure tutor owns this test OR caller is a coordinator
  const tutorIdFromTest = (test as any).tutor?._id ? (test as any).tutor._id : test.tutor;
  const isTutorOwner = String(tutorIdFromTest) === String(tutorUserId);
  const isCoordinator = callerRole === USER_ROLES.COORDINATOR;
  if (!isTutorOwner && !isCoordinator) {
    throw new ErrorResponse('Not authorized to upload paper for this test', 403);
  }

  const finalClass: any = test.finalClass;
  if (!finalClass || String(finalClass.status) !== FINAL_CLASS_STATUS.ACTIVE) {
    throw new ErrorResponse('Can only upload papers for ACTIVE classes', 400);
  }

  const buffer: Buffer = file.buffer;
  const originalname: string = file.originalname || 'test-paper';
  const mimetype: string = file.mimetype || 'application/octet-stream';

  let uploadResult: { key: string; url: string; bucket: string };
  try {
    uploadResult = await uploadFileToS3(
      buffer,
      originalname,
      mimetype,
      S3_CONFIG.FOLDERS.TEST_PAPERS
    );
  } catch (err: any) {
    throw new ErrorResponse('Failed to upload test paper to storage', 500);
  }

  test.paperUrl = uploadResult.url;
  test.paperName = originalname;
  test.paperMimeType = mimetype;
  (test as any).paperS3Key = uploadResult.key;
  if (typeof totalMarks === 'number' && !Number.isNaN(totalMarks)) {
    (test as any).totalMarks = totalMarks;
  }
  if (typeof durationMinutes === 'number' && !Number.isNaN(durationMinutes)) {
    (test as any).durationMinutes = durationMinutes;
  }
  await test.save();

  return test;
};

export const getTestsByParent = async (parentUserId: string, status?: TEST_STATUS | string) => {
  if (!mongoose.isValidObjectId(parentUserId)) {
    return [];
  }

  const classes = await FinalClass.find({ parent: new mongoose.Types.ObjectId(parentUserId) }).select('_id');
  const classIds = classes.map((c) => c._id);
  if (!classIds.length) {
    return [];
  }

  const query: any = { finalClass: { $in: classIds } };
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

export const updateTestStatus = async (testId: string, status: TEST_STATUS, _userId: string) => {
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

  await createNotificationWithPreferences({
    recipient: test.coordinator as any,
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
    await createNotificationWithPreferences({
      recipient: test.tutor as any,
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

  await createNotificationWithPreferences({
    recipient: test.tutor as any,
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
  getTestsByParent,
  uploadTestPaper,
  uploadTestAnswerSheet,
};
