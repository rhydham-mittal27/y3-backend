import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler';
import {
  createShiftRequest,
  approveShiftRequest,
  rejectShiftRequest,
  getShiftRequestsForClass,
  getPendingRequestsForCoordinator,
  getShiftRequestsForTutor,
} from '../services/shiftRequestService';

// POST /api/shift-requests
export const createShiftRequestHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { finalClassId, cycleNumber, shiftDays, reason } = req.body;
  const requestedBy = (req as any).user._id.toString();
  const request = await createShiftRequest({ finalClassId, cycleNumber: Number(cycleNumber), requestedBy, shiftDays: Number(shiftDays), reason });
  res.status(201).json({ success: true, data: request });
});

// PUT /api/shift-requests/:id/approve
export const approveShiftRequestHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const coordinatorId = (req as any).user._id.toString();
  const result = await approveShiftRequest({ requestId: req.params.id, coordinatorId });
  res.status(200).json({ success: true, data: result });
});

// PUT /api/shift-requests/:id/reject
export const rejectShiftRequestHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const coordinatorId = (req as any).user._id.toString();
  const { rejectionReason } = req.body;
  const request = await rejectShiftRequest({ requestId: req.params.id, coordinatorId, rejectionReason });
  res.status(200).json({ success: true, data: request });
});

// GET /api/shift-requests/class/:classId
export const getByClassHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const requests = await getShiftRequestsForClass(req.params.classId);
  res.status(200).json({ success: true, count: requests.length, data: requests });
});

// GET /api/shift-requests/coordinator/pending
export const getPendingForCoordinatorHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const coordinatorId = (req as any).user._id.toString();
  const requests = await getPendingRequestsForCoordinator(coordinatorId);
  res.status(200).json({ success: true, count: requests.length, data: requests });
});

// GET /api/shift-requests/tutor/mine
export const getForTutorHandler = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const tutorId = (req as any).user._id.toString();
  const requests = await getShiftRequestsForTutor(tutorId);
  res.status(200).json({ success: true, count: requests.length, data: requests });
});
