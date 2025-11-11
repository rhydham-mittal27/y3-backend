import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import {
  createAnnouncement,
  getAllAnnouncements,
  getAnnouncementById,
  getAnnouncementByLeadId,
  expressInterest,
  getInterestedTutors,
  deactivateAnnouncement,
} from '../services/announcementService';
import {
  sendCoordinatorAnnouncement,
  getCoordinatorAnnouncements,
  getCoordinatorAnnouncementById,
  getCoordinatorAnnouncementStats,
} from '../services/announcementService';

export const postAnnouncement = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { classLeadId } = req.body as { classLeadId: string };
  const postedBy = req.user!.id;
  const announcement = await createAnnouncement(classLeadId, postedBy);
  return res.status(201).json(successResponse(announcement, 'Announcement posted successfully'));
});

export const getAnnouncements = asyncHandler(async (req, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const isActiveParam = req.query.isActive as string | undefined;
  const sortBy = (req.query.sortBy as string) || 'postedAt';
  const sortOrder = ((req.query.sortOrder as string) || 'desc') as 'asc' | 'desc';

  const isActive = typeof isActiveParam !== 'undefined' ? isActiveParam === 'true' : undefined;

  const { announcements, total } = await getAllAnnouncements(page, limit, isActive, sortBy, sortOrder);
  return res.status(200).json(paginatedResponse(announcements, page, limit, total));
});

export const getAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const announcement = await getAnnouncementById(id);
  return res.status(200).json(successResponse(announcement));
});

export const getAnnouncementByLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params as { leadId: string };
  const announcement = await getAnnouncementByLeadId(leadId);
  return res.status(200).json(successResponse(announcement));
});

export const expressInterestInAnnouncement = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }
  const { id } = req.params as { id: string };
  const { notes } = req.body as { notes?: string };
  const tutorUserId = req.user!.id;
  const updated = await expressInterest(id, tutorUserId, notes);
  return res.status(200).json(successResponse(updated, 'Interest registered successfully'));
});

export const getInterestedTutorsForAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const data = await getInterestedTutors(id);
  return res.status(200).json(successResponse(data));
});

export const deactivateAnnouncementController = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const updated = await deactivateAnnouncement(id);
  return res.status(200).json(successResponse(updated, 'Announcement deactivated'));
});

export const sendCoordinatorAnnouncementController = asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);
  const { subject, message, recipientType, targetClassId, targetTutorId } = req.body as any;
  const coordinatorUserId = req.user!.id;
  const announcement = await sendCoordinatorAnnouncement({
    coordinatorUserId,
    subject,
    message,
    recipientType,
    targetClassId,
    targetTutorId,
  });
  return res.status(201).json(successResponse(announcement, 'Announcement sent successfully'));
});

export const getCoordinatorAnnouncementsController = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.user!.id;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '10', 10);
  const recipientType = req.query.recipientType as string | undefined;
  const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
  const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
  const sortBy = (req.query.sortBy as string) || 'sentAt';
  const sortOrder = ((req.query.sortOrder as string) || 'desc') as 'asc' | 'desc';

  const { announcements, total } = await getCoordinatorAnnouncements({
    coordinatorUserId,
    page,
    limit,
    recipientType,
    fromDate,
    toDate,
    sortBy,
    sortOrder,
  });
  return res.status(200).json(paginatedResponse(announcements, page, limit, total));
});

export const getCoordinatorAnnouncementController = asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const coordinatorUserId = req.user!.id;
  const announcement = await getCoordinatorAnnouncementById(id, coordinatorUserId);
  return res.status(200).json(successResponse(announcement));
});

export const getCoordinatorAnnouncementStatsController = asyncHandler(async (req: AuthRequest, res) => {
  const coordinatorUserId = req.user!.id;
  const stats = await getCoordinatorAnnouncementStats(coordinatorUserId);
  return res.status(200).json(successResponse(stats));
});
