import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import {
  createTeacherRequest,
  getMyTeacherRequests,
  getTeacherRequestById,
  getAllTeacherRequests,
  updateTeacherRequestStatus,
} from '../services/teacherRequestService';
import { AuthRequest } from '../types';

/** POST /api/v1/teacher-requests — PARENT only */
export const createTeacherRequestController = asyncHandler(
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse('Not authenticated', 401);

    const {
      studentName, submitterType, board, grade, subjects,
      mode, preferredDays, preferredTimeSlot,
      address, city, budgetRange, notes,
    } = req.body;

    const result = await createTeacherRequest(userId, {
      studentName, submitterType, board, grade,
      subjects: Array.isArray(subjects) ? subjects : [subjects],
      mode, preferredDays, preferredTimeSlot,
      address, city, budgetRange, notes,
    });

    return res.status(201).json(
      successResponse(result, 'Teacher request submitted successfully.'),
    );
  },
);

/** GET /api/v1/teacher-requests/my — PARENT only */
export const getMyTeacherRequestsController = asyncHandler(
  async (req: AuthRequest, res) => {
    const userId = req.user?.id;
    if (!userId) throw new ErrorResponse('Not authenticated', 401);

    const data = await getMyTeacherRequests(userId);
    return res.status(200).json(successResponse(data, 'Requests fetched.'));
  },
);

/** GET /api/v1/teacher-requests/:id — PARENT (own) or MANAGER/ADMIN */
export const getTeacherRequestByIdController = asyncHandler(
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const data = await getTeacherRequestById(id);
    return res.status(200).json(successResponse(data, 'Request fetched.'));
  },
);

/** GET /api/v1/teacher-requests — MANAGER/ADMIN only */
export const getAllTeacherRequestsController = asyncHandler(
  async (req: AuthRequest, res) => {
    const { status, page, limit } = req.query;
    const data = await getAllTeacherRequests({
      status: status as string | undefined,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return res.status(200).json(successResponse(data, 'All requests fetched.'));
  },
);

/** PATCH /api/v1/teacher-requests/:id/status — MANAGER/ADMIN only */
export const updateTeacherRequestStatusController = asyncHandler(
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

    const { id } = req.params;
    const { status, notes } = req.body;
    const data = await updateTeacherRequestStatus(id, status, notes);
    return res.status(200).json(successResponse(data, 'Status updated.'));
  },
);
