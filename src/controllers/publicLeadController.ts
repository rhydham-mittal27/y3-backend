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
        '🎯 New Class Lead Assigned - Your Shikshak',
        `<!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Lead Assignment</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
            .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); margin-top: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #10b981; padding-bottom: 20px; }
            .logo { font-size: 28px; font-weight: bold; color: #10b981; margin-bottom: 10px; }
            .alert-badge { display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-bottom: 20px; }
            .lead-card { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border: 2px solid #10b981; }
            .lead-item { display: flex; align-items: start; margin: 15px 0; padding-bottom: 12px; border-bottom: 1px solid #a7f3d0; }
            .lead-item:last-child { border-bottom: none; }
            .label { font-weight: bold; color: #047857; min-width: 120px; font-size: 13px; text-transform: uppercase; }
            .value { color: #1f2937; font-size: 14px; }
            .parent-contact { background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
            .parent-contact h3 { margin-top: 0; color: #856404; font-size: 14px; }
            .contact-item { margin: 8px 0; color: #856404; font-size: 13px; }
            .cta-section { text-align: center; margin: 30px 0; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 35px; border-radius: 25px; text-decoration: none; font-weight: bold; text-align: center; }
            .cta-button:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(16, 185, 129, 0.4); }
            .quick-actions { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .quick-actions h3 { color: #15803d; margin-top: 0; font-size: 15px; }
            .quick-actions p { margin: 10px 0; color: #4b5563; font-size: 13px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px; }
            .footer a { color: #10b981; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">✓ Your Shikshak</div>
            </div>

            <div style="text-align: center;">
              <span class="alert-badge">🎯 NEW LEAD OPPORTUNITY</span>
            </div>

            <h2 style="color: #333; text-align: center; margin-bottom: 25px;">New Class Lead Assigned</h2>

            <p>Hello ${managerName},</p>

            <p style="font-size: 15px;">Excellent news! A new class lead has been assigned to you from our marketing platform. Review the details below:</p>

            <div class="lead-card">
              <div class="lead-item">
                <span class="label">👤 Student Name:</span>
                <span class="value"><strong>${studentName || 'N/A'}</strong></span>
              </div>
              <div class="lead-item">
                <span class="label">📚 Grade:</span>
                <span class="value"><strong>${grade || 'N/A'}</strong></span>
              </div>
              <div class="lead-item">
                <span class="label">📖 Subjects:</span>
                <span class="value"><strong>${subjectsList || 'N/A'}</strong></span>
              </div>
              <div class="lead-item">
                <span class="label">🎓 Board/Mode:</span>
                <span class="value"><strong>${board || 'N/A'} / ${mode || 'N/A'}</strong></span>
              </div>
              <div class="lead-item">
                <span class="label">📍 Location:</span>
                <span class="value"><strong>${locationParts || 'N/A'}</strong></span>
              </div>
              <div class="lead-item">
                <span class="label">⏰ Preferred Time:</span>
                <span class="value"><strong>${timing || 'N/A'}</strong></span>
              </div>
            </div>

            <div class="parent-contact">
              <h3>👨‍👩‍👧 Parent Information</h3>
              <div class="contact-item"><strong>Name:</strong> ${parentName || 'N/A'}</div>
              <div class="contact-item"><strong>Phone:</strong> ${parentPhone || 'N/A'}</div>
              ${parentEmail ? `<div class="contact-item"><strong>Email:</strong> ${parentEmail}</div>` : ''}
            </div>

            <div class="quick-actions">
              <h3>✨ What to do next:</h3>
              <p>1. Review the student's requirements carefully</p>
              <p>2. Log in to your dashboard to confirm acceptance</p>
              <p>3. Contact the parent to finalize details</p>
              <p>4. Create a customized tuition plan</p>
            </div>

            <div class="cta-section">
              <a href="https://yourshikshak.com/dashboard/leads" class="cta-button">View Lead in Dashboard →</a>
            </div>

            <p style="text-align: center; color: #666; font-size: 14px;">Time-sensitive: Act quickly to secure this lead opportunity!</p>

            <div class="footer">
              <p style="margin: 0;">Best regards,<br><strong>Your Shikshak Lead Management Team</strong></p>
              <p style="margin-top: 10px;"><a href="mailto:support@yourshikshak.com">Support</a> | <a href="https://yourshikshak.com/help">Help</a></p>
              <p style="margin-top: 10px; font-size: 12px; color: #999;"><small>This is an automated message. Please do not reply to this email.</small></p>
            </div>
          </div>
        </body>
        </html>`
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
