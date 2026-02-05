import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { createClassLead } from '../services/leadService';
import Manager from '../models/Manager';
import User from '../models/User';
import { sendEmail } from '../utils/emailService';
import { LEAD_SOURCE, TEACHING_MODE, BOARD_TYPE } from '../config/constants';

export const createPublicParentLead = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const {
    studentName,
    studentGender,
    parentName,
    parentEmail,
    parentPhone,
    grade,
    subject,
    board,
    mode,
    city,
    area,
    address,
    timing,
    preferredTutorGender,
    notes,
  } = req.body;

  // Determine which manager/user will own these public leads
  let createdByUserId = process.env.PUBLIC_LEAD_MANAGER_USER_ID;

  if (!createdByUserId) {
    // Pick a random manager so that each public lead belongs to exactly one manager
    const managers = await Manager.find().populate('user');
    if (!managers || managers.length === 0) {
      throw new ErrorResponse('No manager configured to own public leads', 500);
    }

    const randomIndex = Math.floor(Math.random() * managers.length);
    const chosenManager = managers[randomIndex];

    if (!chosenManager.user) {
      throw new ErrorResponse('Selected manager does not have an associated user', 500);
    }

    createdByUserId = String((chosenManager.user as any)._id || chosenManager.user);
  }

  const lead = await createClassLead({
    studentType: 'SINGLE',
    studentName,
    studentGender,
    parentName,
    parentEmail,
    parentPhone,
    grade,
    subject,
    board: board as BOARD_TYPE | string,
    mode: mode as TEACHING_MODE | string,
    city,
    area,
    address,
    timing,
    classesPerMonth: undefined,
    classDurationHours: undefined,
    preferredTutorGender,
    leadSource: LEAD_SOURCE.GOOGLE_PROFILE,
    paymentReceived: false,
    paymentAmount: undefined,
    tutorFees: undefined,
    notes,
    createdBy: createdByUserId,
  });

  // Best-effort email notification to the manager who owns this public lead
  try {
    const managerUser = await User.findById(createdByUserId).select('email name');
    if (managerUser && managerUser.email) {
      const managerName = (managerUser as any).name || 'Manager';
      const subjectsList = Array.isArray(subject) ? subject.join(', ') : String(subject || '');
      const locationParts = [city, area].filter(Boolean).join(', ');

      await sendEmail(
        managerUser.email,
        'New public class lead assigned to you',
        `<p>Dear ${managerName},</p>
         <p>A new public class lead has been assigned to you from the marketing site.</p>
         <p><strong>Student:</strong> ${studentName || 'N/A'} (${grade || 'N/A'})</p>
         <p><strong>Subjects:</strong> ${subjectsList || 'N/A'}</p>
         <p><strong>Board / Mode:</strong> ${board || 'N/A'} / ${mode || 'N/A'}</p>
         <p><strong>Location:</strong> ${locationParts || 'N/A'}</p>
         <p><strong>Preferred Time:</strong> ${timing || 'N/A'}</p>
         <p><strong>Parent Contact:</strong> ${parentName || 'N/A'} (${parentPhone || 'N/A'})${parentEmail ? `, ${parentEmail}` : ''}</p>
         <p>Please log in to the dashboard to review and process this lead.</p>
         <p>Regards,<br/>Your Shikshak</p>`
      );
    }
  } catch (e) {
    // Email failures should not block lead creation
    // eslint-disable-next-line no-console
    console.error('[createPublicParentLead] Failed to send manager email', e);
  }

  return res.status(201).json(successResponse(lead, 'Class lead created successfully'));
});


export const getPublicLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await import('../models/ClassLead').then(mod => mod.default.findById(id));

  if (!lead) {
    throw new ErrorResponse('Lead not found', 404);
  }

  // Check for 7-day expiration (Link valid for 7 days from creation)
  const expirationDate = new Date(lead.createdAt);
  expirationDate.setDate(expirationDate.getDate() + 7);
  
  if (new Date() > expirationDate) {
    throw new ErrorResponse('This lead link has expired (valid for 7 days).', 410);
  }

  // Sanitize student details to remove parent PII
  const sanitizedStudentDetails = lead.studentDetails?.map((s: any) => ({
    name: s.name,
    gender: s.gender,
    // fees: s.fees, // Optional: Decide if we show parent fees vs tutor fees
    // tutorFees: s.tutorFees
  }));

  // Sanitize: Return comprehensive public details
  const publicDetails = {
    _id: lead._id,
    leadId: lead.leadId,
    status: lead.status,
    createdAt: lead.createdAt,
    
    // Student Info
    studentType: lead.studentType,
    studentName: lead.studentName, // Included as requested
    studentGender: lead.studentGender,
    numberOfStudents: lead.numberOfStudents,
    studentDetails: sanitizedStudentDetails, // Sanitized list
    
    // Academic Info
    grade: lead.grade,
    subject: lead.subject,
    board: lead.board,
    mode: lead.mode,
    
    // Location
    city: lead.city,
    area: lead.area,
    location: lead.location,
    // address: lead.address, // Still hiding full address for safety
    
    // Timing & Duration
    timing: lead.timing,
    classesPerMonth: lead.classesPerMonth,
    classDurationHours: lead.classDurationHours,
    
    // Preferences
    preferredTutorGender: lead.preferredTutorGender,
    notes: lead.notes,
    
    // Financials
    tutorFees: lead.tutorFees, 
    // paymentAmount: lead.paymentAmount, // Hidden as per user request
  };

  return res.status(200).json(successResponse(publicDetails, 'Public lead details fetched successfully'));
});

export default {
  createPublicParentLead,
  getPublicLead
};
