import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import { getParentDashboardStats, getClassesByParent, getAnnouncementsForParent } from '../services/studentService';

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

export default {
  getDashboardStats,
  getMyClasses,
  getMyAnnouncements,
};

