import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import { getParentDashboardStats, getClassesByParent, getAnnouncementsForParent } from '../services/studentService';

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
export const getStudentDashboardStats = asyncHandler(async (_req: AuthRequest, res) => {
  // Mock student dashboard stats - replace with real implementation
  // TODO: Use _req.user!.id when implementing real functionality
  const stats = {
    classes: {
      total: 2,
      active: 2,
    },
    attendance: {
      percentage: 90,
      present: 18,
      absent: 1,
      late: 1,
    },
    tests: {
      total: 3,
      pending: 1,
      completed: 2,
    },
    notes: {
      total: 4,
      recent: 2,
    },
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

export const getStudentAttendance = asyncHandler(async (_req: AuthRequest, res) => {
  // Mock attendance data - replace with real implementation
  // TODO: Use _req.user!.id, _req.query.month, _req.query.page, _req.query.limit when implementing real functionality
  const attendanceData = [
    {
      month: 'December 2024',
      stats: {
        total: 20,
        present: 18,
        absent: 1,
        late: 1,
        percentage: 90,
      },
      records: [
        { date: '2024-12-01', status: 'present', subject: 'Mathematics' },
        { date: '2024-12-02', status: 'present', subject: 'Science' },
        { date: '2024-12-03', status: 'late', subject: 'Mathematics' },
        { date: '2024-12-04', status: 'present', subject: 'Science' },
        { date: '2024-12-05', status: 'absent', subject: 'Mathematics' },
      ],
    },
  ];

  return res.json(successResponse(attendanceData));
});

export const getStudentTests = asyncHandler(async (req: AuthRequest, res) => {
  // Mock tests data - replace with real implementation
  // TODO: Use req.user!.id, req.query.status when implementing real functionality
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  // Mock tests data - replace with real implementation
  const tests = [
    {
      id: 1,
      title: 'Mathematics Chapter 5 Test',
      subject: 'Mathematics',
      type: 'Test',
      date: '2024-12-10',
      time: '10:00 AM',
      duration: '45 minutes',
      status: 'upcoming',
      totalMarks: 100,
      description: 'Chapter 5: Fractions and Decimals',
    },
    {
      id: 2,
      title: 'Science Lab Report',
      subject: 'Science',
      type: 'Assignment',
      date: '2024-12-08',
      time: '11:59 PM',
      duration: '2 hours',
      status: 'submitted',
      totalMarks: 50,
      obtainedMarks: 45,
      description: 'Lab report on plant growth experiment',
    },
  ];

  const total = tests.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedTests = tests.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedTests, page, limit, total));
});

export const getStudentNotes = asyncHandler(async (req: AuthRequest, res) => {
  // Mock notes data - replace with real implementation
  // TODO: Use req.user!.id, req.query.subject, req.query.type when implementing real functionality
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);

  // Mock notes data - replace with real implementation
  const notes = [
    {
      id: 1,
      title: 'Mathematics Chapter 5 Notes',
      subject: 'Mathematics',
      type: 'pdf',
      size: '2.5 MB',
      uploadDate: '2024-12-01',
      description: 'Complete notes for Chapter 5: Fractions and Decimals',
      downloadUrl: '#',
      previewUrl: '#',
    },
    {
      id: 2,
      title: 'Science Lab Video Tutorial',
      subject: 'Science',
      type: 'video',
      size: '45 MB',
      uploadDate: '2024-12-02',
      description: 'Video tutorial for plant growth experiment',
      downloadUrl: '#',
      previewUrl: '#',
    },
  ];

  const total = notes.length;
  const start = (page - 1) * limit;
  const end = page * limit;
  const paginatedNotes = notes.slice(start, end);

  return res.status(200).json(paginatedResponse(paginatedNotes, page, limit, total));
});

export default {
  getDashboardStats,
  getMyClasses,
  getMyAnnouncements,
  getStudentDashboardStats,
  getStudentClasses,
  getStudentAttendance,
  getStudentTests,
  getStudentNotes,
};

