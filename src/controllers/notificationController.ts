import asyncHandler from '../utils/asyncHandler';
import { successResponse, paginatedResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import {
  getNotificationsByUser,
  getUnreadCount,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
} from '../services/notificationService';

export const getMyNotifications = asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const isReadParam = req.query.isRead as string | undefined;
  const isRead = typeof isReadParam !== 'undefined' ? isReadParam === 'true' : undefined;
  const userId = req.user!.id;

  const { notifications, total } = await getNotificationsByUser(userId, page, limit, isRead);
  return res.status(200).json(paginatedResponse(notifications, page, limit, total));
});

export const getUnreadNotificationCount = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const count = await getUnreadCount(userId);
  return res.status(200).json(successResponse({ count }));
});

export const markAsRead = asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const userId = req.user!.id;
  const updated = await markNotificationAsRead(id, userId);
  return res.status(200).json(successResponse(updated, 'Notification marked as read'));
});

export const markAllNotificationsAsRead = asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const result = await markAllAsRead(userId);
  return res.status(200).json(successResponse(result, 'All notifications marked as read'));
});

export const deleteNotificationController = asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const userId = req.user!.id;
  await deleteNotification(id, userId);
  return res.status(200).json(successResponse({}, 'Notification deleted'));
});
