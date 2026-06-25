import { validationResult } from "express-validator";
import asyncHandler from "../utils/asyncHandler";
import { successResponse } from "../utils/responseFormatter";
import ErrorResponse from "../utils/errorResponse";
import ParentLead from "../models/ParentLead";
import {
  registerParentUser,
  getParentProfile,
  getParentDashboardData,
  submitParentTutorRequest,
  raiseParentConcern,
  getParentSessionsData,
  verifyParentAttendanceRecord,
  requestParentReschedule,
  getParentPaymentsData,
} from "../services/parentService";
import { AuthRequest } from "../types";

/**
 * POST /api/v1/parent-leads
 * Public — no auth required.
 * Saves basic parent + student details as a sales lead for the team to follow up.
 */
export const registerParentLead = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const {
    parentName,
    parentEmail,
    parentPhone,
    studentName,
    studentGrade,
    city,
    notes,
  } = req.body;

  const lead = await ParentLead.create({
    parentName,
    parentEmail,
    parentPhone,
    studentName,
    studentGrade: studentGrade || undefined,
    city: city || undefined,
    notes: notes || undefined,
    source: "MOBILE_APP",
    status: "NEW",
  });

  return res
    .status(201)
    .json(
      successResponse(
        {
          id: lead._id,
          parentName: lead.parentName,
          studentName: lead.studentName,
          createdAt: lead.createdAt,
        },
        "Registration successful! Our team will contact you shortly.",
      ),
    );
});

/**
 * POST /api/v1/parents/register
 * Public — creates a User (role=PARENT) + Parent profile, returns tokens.
 */
export const registerParent = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const result = await registerParentUser(req.body);

  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res
    .status(201)
    .json(
      successResponse(
        {
          user: result.user,
          parent: result.parent,
          accessToken: result.accessToken,
        },
        "Parent account created successfully.",
      ),
    );
});

/**
 * GET /api/v1/parents/me
 * Protected — returns the authenticated parent's profile.
 */
export const getMyParentProfile = asyncHandler(
  async (req: AuthRequest, res) => {
    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse("Not authenticated", 401);

    const parent = await getParentProfile(userId);
    return res
      .status(200)
      .json(successResponse(parent, "Parent profile fetched successfully."));
  },
);

/**
 * GET /api/v1/parents/dashboard
 * Protected — PARENT only. Returns two-state dashboard payload.
 */
export const getParentDashboard = asyncHandler(
  async (req: AuthRequest, res) => {
    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse("Not authenticated", 401);

    const data = await getParentDashboardData(userId);
    return res.status(200).json(successResponse(data, "Dashboard loaded."));
  },
);

/**
 * POST /api/v1/parents/tutor-request
 * Protected — PARENT only. Creates a new tutor request (ParentLead).
 */
export const submitTutorRequest = asyncHandler(
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse("Not authenticated", 401);

    const { subject, grade, board, mode, city, notes } = req.body;
    const result = await submitParentTutorRequest(userId, {
      subject,
      grade,
      board,
      mode,
      city,
      notes,
    });
    return res
      .status(201)
      .json(successResponse(result, "Tutor request submitted successfully."));
  },
);

/**
 * POST /api/v1/parents/concern
 * Protected — PARENT only. Raises a concern for a class.
 */
export const raiseParentConcernController = asyncHandler(
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse("Not authenticated", 401);

    const { finalClassId, message } = req.body;
    const result = await raiseParentConcern(userId, finalClassId, message);
    return res
      .status(200)
      .json(
        successResponse(result, "Concern raised. Our team will follow up."),
      );
  },
);

/** GET /api/v1/parents/sessions?month=YYYY-MM */
export const getParentSessions = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ErrorResponse("Not authenticated", 401);
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const data = await getParentSessionsData(userId, month);
  return res.status(200).json(successResponse(data, "Sessions loaded."));
});

/** POST /api/v1/parents/attendance/verify */
export const verifyAttendance = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const userId = req.user?.id;
  if (!userId) throw new ErrorResponse("Not authenticated", 401);
  const { attendanceId, verified } = req.body;
  const result = await verifyParentAttendanceRecord(userId, attendanceId, verified ?? true);
  return res.status(200).json(successResponse(result, "Attendance verified."));
});

/** POST /api/v1/parents/reschedule */
export const requestReschedule = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const userId = req.user?.id;
  if (!userId) throw new ErrorResponse("Not authenticated", 401);
  const result = await requestParentReschedule(userId, req.body);
  return res.status(201).json(successResponse(result, "Reschedule request submitted."));
});

/** GET /api/v1/parents/payments */
export const getParentPayments = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) throw new ErrorResponse("Not authenticated", 401);
  const data = await getParentPaymentsData(userId);
  return res.status(200).json(successResponse(data, "Payments loaded."));
});

export default {
  registerParentLead,
  registerParent,
  getMyParentProfile,
  getParentDashboard,
  submitTutorRequest,
  raiseParentConcernController,
  getParentSessions,
  verifyAttendance,
  requestReschedule,
  getParentPayments,
};
