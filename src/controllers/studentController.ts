import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import ErrorResponse from '../utils/errorResponse';
import { getParentDashboardStats, getClassesByParent, getAnnouncementsForParent } from '../services/studentService';
import { listNotesForStudent } from '../services/noteService';
import { getPaymentsByClass } from '../services/paymentService';
import Student from '../models/Student';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import Test from '../models/Test';

// Parent controllers (existing)
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res) => {
  const parentUserId = req.user!.id;
  const stats = await getParentDashboardStats(parentUserId);
  return res.json(successResponse(stats));
});

export const getMyClasses = asyncHandler(async (req: AuthRequest, res) => {
  const parentUserId = req.user!.id;
  const status = (req.query.status as string) || undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const classes = await getClassesByParent(parentUserId, status);

  const total = classes.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedClasses = classes.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedClasses, page, limit, total));
});

export const getMyAnnouncements = asyncHandler(async (req: AuthRequest, res) => {
  const parentUserId = req.user!.id;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const fromDate = (req.query.fromDate as string) || undefined;
  const toDate = (req.query.toDate as string) || undefined;

  const result = await getAnnouncementsForParent(
    parentUserId,
    page,
    limit,
    fromDate ? new Date(fromDate) : undefined,
    toDate ? new Date(toDate) : undefined
  );

  return res.json(paginatedResponse(result.announcements, result.page, result.limit, result.total));
});

// Student controllers (new)
export const getStudentDashboardStats = asyncHandler(async (req: AuthRequest, res) => {
  // Mock student dashboard stats - replace with real implementation
  // TODO: Use _req.user!.id when implementing real functionality

  const studentUserId = req.user!.id;

  const Student = require('../models/Student').default;
  const FinalClass = require('../models/FinalClass').default;
  const Attendance = require('../models/Attendance').default;
  const Test = require('../models/Test').default;

  const student = await Student.findById(studentUserId);
  if (!student) {
    const emptyStats = {
      classes: { total: 0, active: 0 },
      attendance: { percentage: 0, present: 0, absent: 0, late: 0 },
      tests: { total: 0, pending: 0, completed: 0 },
      notes: { total: 0, recent: 0 },
    };
    return res.json(successResponse(emptyStats));
  }

  const finalClassId = student.finalClass;
  const cls = await FinalClass.findById(finalClassId).select('status');

  const classes = {
    total: cls ? 1 : 0,
    active: cls && String((cls as any).status) === 'ACTIVE' ? 1 : 0,
  };

  // Attendance summary for this student's class
  let attendance = { percentage: 0, present: 0, absent: 0, late: 0 };
  if (cls) {
    const records = await Attendance.find({ finalClass: finalClassId }).select('studentAttendanceStatus');
    const total = records.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    records.forEach((r: any) => {
      const status = (r.studentAttendanceStatus || '').toString().toUpperCase();
      if (status === 'PRESENT') present += 1;
      else if (status === 'ABSENT') absent += 1;
      else if (status === 'LATE') late += 1;
    });
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    attendance = { percentage, present, absent, late };
  }

  // Tests summary for this student's class
  let tests = { total: 0, pending: 0, completed: 0 };
  if (cls) {
    const testsRaw = await Test.find({ finalClass: finalClassId }).select('status');
    let total = testsRaw.length;
    let pending = 0;
    let completed = 0;
    testsRaw.forEach((t: any) => {
      const status = (t.status || '').toString().toUpperCase();
      if (status === 'SCHEDULED') pending += 1;
      if (status === 'COMPLETED' || status === 'REPORT_SUBMITTED') completed += 1;
    });
    tests = { total, pending, completed };
  }

  // Notes - placeholder counts for now (can be wired to real notes later)
  const notes = { total: 0, recent: 0 };

  const stats = {
    classes,
    attendance,
    tests,
    notes,
  };

  return res.json(successResponse(stats));
});

export const getStudentClasses = asyncHandler(async (req: AuthRequest, res) => {
  const studentUserId = req.user!.id;
  const status = (req.query.status as string) || undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  // Find the student first
  const Student = require('../models/Student').default;
  const student = await Student.findById(studentUserId);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  // Find classes where this student is enrolled
  const FinalClass = require('../models/FinalClass').default;
  
  let query: any = {
    $or: [
      { studentId: student.studentId },
      { studentName: student.name }
    ]
  };
  
  if (status) {
    query.status = status;
  }

  const classes = await FinalClass.find(query)
    .populate('tutor', 'name email phone')
    .populate('coordinator', 'name email')
    .populate('classLead', 'name email')
    .sort({ createdAt: -1 });

  // Transform the data to match the expected frontend format
  const transformedClasses = classes.map((cls: any) => ({
    id: cls._id,
    name: `${cls.subject.join(', ')} - Grade ${cls.grade}`,
    subject: cls.subject.join(', '),
    teacher: cls.tutor?.name || 'Not assigned',
    schedule: cls.schedule ? 
      `${cls.schedule.daysOfWeek?.join(', ')} - ${cls.schedule.timeSlot}` : 
      'Schedule not set',
    nextClass: 'Today', // You might want to calculate this based on schedule
    room: cls.location || 'Online',
    status: cls.status,
    progress: cls.totalSessions > 0 ? Math.round((cls.completedSessions / cls.totalSessions) * 100) : 0,
    grade: cls.grade,
    board: cls.board,
    mode: cls.mode,
    totalSessions: cls.totalSessions,
    completedSessions: cls.completedSessions,
  }));

  const total = transformedClasses.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedClasses = transformedClasses.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedClasses, page, limit, total));
});

export const getStudentAttendance = asyncHandler(async (req: AuthRequest, res) => {
  // Mock attendance data - replace with real implementation
  // TODO: Use _req.user!.id, _req.query.month, _req.query.page, _req.query.limit when implementing real functionality

  const studentUserId = req.user!.id;
  const monthFilter = (req.query.month as string) || undefined; // Expecting format like '2024-12'

  const Student = require('../models/Student').default;
  const Attendance = require('../models/Attendance').default;
  const FinalClass = require('../models/FinalClass').default;

  const student = await Student.findById(studentUserId);
  if (!student) {
    return res.json(successResponse([]));
  }

  const finalClassId = student.finalClass;
  const finalClass = await FinalClass.findById(finalClassId).select('subject');

  const match: any = { finalClass: finalClassId };

  if (monthFilter) {
    const [yearStr, monthStr] = monthFilter.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    if (!isNaN(year) && !isNaN(month)) {
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
      match.sessionDate = { $gte: start, $lt: end };
    }
  }

  const attendances = await Attendance.find(match).sort({ sessionDate: -1 });

  if (!attendances.length) {
    return res.json(successResponse([]));
  }

  const subjectLabel = finalClass
    ? Array.isArray((finalClass as any).subject)
      ? (finalClass as any).subject.join(', ')
      : (finalClass as any).subject
    : 'Class';

  const grouped: Record<
    string,
    {
      month: string;
      stats: { total: number; present: number; absent: number; late: number; percentage: number };
      records: { date: string; status: string; subject: string }[];
    }
  > = {};

  attendances.forEach((att: any) => {
    const d = new Date(att.sessionDate);
    const monthLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;

    if (!grouped[key]) {
      grouped[key] = {
        month: monthLabel,
        stats: { total: 0, present: 0, absent: 0, late: 0, percentage: 0 },
        records: [],
      };
    }

    const bucket = grouped[key];
    const statusRaw = (att.studentAttendanceStatus || 'PRESENT').toString().toUpperCase();
    const status = statusRaw === 'PRESENT' ? 'present' : statusRaw === 'ABSENT' ? 'absent' : statusRaw === 'LATE' ? 'late' : 'present';

    bucket.stats.total += 1;
    if (status === 'present') bucket.stats.present += 1;
    if (status === 'absent') bucket.stats.absent += 1;
    if (status === 'late') bucket.stats.late += 1;

    bucket.records.push({
      date: d.toISOString().slice(0, 10),
      status,
      subject: subjectLabel,
    });
  });

  const attendanceData = Object.values(grouped).map((g) => ({
    month: g.month,
    stats: {
      total: g.stats.total,
      present: g.stats.present,
      absent: g.stats.absent,
      late: g.stats.late,
      percentage: g.stats.total > 0 ? Math.round((g.stats.present / g.stats.total) * 100) : 0,
    },
    records: g.records,
  }));

  return res.json(successResponse(attendanceData));
});

export const getStudentTests = asyncHandler(async (req: AuthRequest, res) => {
  // Mock tests data - replace with real implementation
  // TODO: Use req.user!.id, req.query.status when implementing real functionality
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const studentUserId = req.user!.id;

  const Student = require('../models/Student').default;
  const Test = require('../models/Test').default;
  const FinalClass = require('../models/FinalClass').default;

  const student = await Student.findById(studentUserId);
  if (!student) {
    return res.status(200).json(paginatedResponse([], page, limit, 0));
  }

  const finalClassId = student.finalClass;
  const finalClass = await FinalClass.findById(finalClassId).select('subject grade');

  const subjectLabel = finalClass
    ? Array.isArray((finalClass as any).subject)
      ? (finalClass as any).subject.join(', ')
      : (finalClass as any).subject
    : 'Class Test';

  const testsRaw = await Test.find({ finalClass: finalClassId }).sort({ testDate: 1 });

  const mappedTests = testsRaw.map((t: any) => {
    const date = t.testDate ? new Date(t.testDate) : null;
    const statusRaw = (t.status || '').toString().toUpperCase();
    let status: string = 'upcoming';
    if (statusRaw === 'COMPLETED' || statusRaw === 'REPORT_SUBMITTED') status = 'completed';
    else if (statusRaw === 'CANCELLED') status = 'cancelled';

    return {
      id: String(t._id),
      title: `${subjectLabel} Test`,
      subject: subjectLabel,
      type: 'Test',
      date: date ? date.toISOString().slice(0, 10) : '',
      time: t.testTime || '',
      duration: typeof t.durationMinutes === 'number' && !Number.isNaN(t.durationMinutes)
        ? `${t.durationMinutes} min`
        : '',
      status,
      totalMarks: typeof t.totalMarks === 'number' && !Number.isNaN(t.totalMarks) ? t.totalMarks : undefined,
      obtainedMarks:
        typeof t.obtainedMarks === 'number' && !Number.isNaN(t.obtainedMarks) ? t.obtainedMarks : undefined,
      description: t.notes || 'Class test',
      paperUrl: t.paperUrl || undefined,
      topicName: t.topicName || undefined,
      answerSheetUrl: t.answerSheetUrl || undefined,
    };
  });

  const total = mappedTests.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedTests = mappedTests.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedTests, page, limit, total));
});

export const getStudentNotes = asyncHandler(async (req: AuthRequest, res) => {
  // Mock notes data - replace with real implementation
  // TODO: Use req.user!.id, req.query.subject, req.query.type when implementing real functionality
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const studentUserId = req.user!.id;
  const parentIdRaw = (req.query.parentId as string) || '';
  const parentId = parentIdRaw && parentIdRaw.trim().length > 0 ? parentIdRaw.trim() : null;

  const all = await listNotesForStudent(studentUserId, parentId);

  const total = all.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedNotes = all.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedNotes, page, limit, total));
});

export const getStudentPayments = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  const studentUserId = req.user!.id;
  const student = await Student.findById(studentUserId).select('finalClass');
  if (!student || !student.finalClass) {
    return res.status(200).json(paginatedResponse([], page, limit, 0));
  }

  const { payments } = await getPaymentsByClass(String(student.finalClass));

  const total = payments.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginated = payments.slice(start, end).map((p: any) => ({
    id: String(p._id),
    ...p.toObject(),
  }));

  return res.status(200).json(paginatedResponse(paginated, page, limit, total));
});

export const getStudentProfile = asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params.id;
  // Try finding by studentId string first, then by _id
  let student = await Student.findOne({ studentId: id });
  if (!student && mongoose.Types.ObjectId.isValid(id)) {
    student = await Student.findById(id);
  }

  if (!student) {
    throw new ErrorResponse('Student not found', 404);
  }

  const userRole = req.user?.role;
  const isStaff = ['ADMIN', 'MANAGER', 'COORDINATOR'].includes(userRole || '');

  if (isStaff) {
    // Find classes where this student is enrolled
    const classes = await FinalClass.find({
      $or: [
        { studentId: student.studentId },
        { studentName: student.name }
      ]
    })
    .populate('tutor', 'name email phone')
    .populate('coordinator', 'name email')
    .populate('classLead'); // Populate full classLead for demoDetails

    // Get payment summary
    const payments = await Payment.find({
      $or: [
        { studentId: student.studentId },
        { studentName: student.name }
      ]
    }).sort({ month: -1 });

    // Get attendance summary (stat only)
    const attendanceStats = await Attendance.aggregate([
      { $match: { 
          $or: [
            { studentId: student.studentId },
            { studentName: student.name }
          ]
      }},
      { $group: {
          _id: '$studentAttendanceStatus',
          count: { $sum: 1 }
      }}
    ]);

    // Get tests
    const classIds = classes.map(c => c._id);
    const tests = await Test.find({ finalClass: { $in: classIds } }).sort({ testDate: -1 });

    const enrichedStudent = student.toObject();
    (enrichedStudent as any).classes = classes;
    (enrichedStudent as any).payments = payments;
    (enrichedStudent as any).attendanceStats = attendanceStats;
    (enrichedStudent as any).tests = tests; // Add tests to response
    return res.json(successResponse(enrichedStudent));
  }

  return res.json(successResponse(student));
});

export default {
  getDashboardStats,
  getMyClasses,
  getMyAnnouncements,
  getStudentAttendance,
  getStudentTests,
  getStudentNotes,
  getStudentProfile,
};

