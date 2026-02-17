import Notification, { NotificationType } from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { getUserPreferences } from './settingsService';
// import User from '../models/User';
import logger from '../utils/logger';
// import { FCM_CONFIG } from '../config/constants';

export const getNotificationsByUser = async (
  userId: string,
  page: number,
  limit: number,
  isRead?: boolean
) => {
  const query: any = { recipient: userId };
  if (typeof isRead === 'boolean') query.isRead = isRead;
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate('relatedAnnouncement relatedClassLead'),
    Notification.countDocuments(query),
  ]);

  return { notifications, total, page, limit };
};

export const getUnreadCount = async (userId: string) => {
  const count = await Notification.countDocuments({ recipient: userId, isRead: false });
  return count;
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
  if (!notification) throw new ErrorResponse('Notification not found', 404);
  if (notification.isRead) return notification;
  return notification.markAsRead();
};

export const markAllAsRead = async (userId: string) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
};

export const deleteNotification = async (notificationId: string, userId: string) => {
  const deleted = await Notification.findOneAndDelete({ _id: notificationId, recipient: userId });
  if (!deleted) throw new ErrorResponse('Notification not found', 404);
  return deleted;
};

export const sendPushNotificationToDevice = async (
  fcmToken: string,
  _title: string,
  _body: string,
  _data?: Record<string, string>,
  _imageUrl?: string
) => {
  // Firebase removed
  logger.info('FCM push (mocked) sent to single device', { fcmToken });
  return { success: true };
};

export const sendPushNotification = async (
  userId: string,
  _title: string,
  _body: string,
  _data?: Record<string, string>,
  _imageUrl?: string
) => {
  // Firebase removed
  logger.info('FCM push (mocked) summary for user', { userId });
  return { sent: 0, failed: 0, invalidTokens: [] };
};

export const sendPushToMultipleUsers = async (
  userIds: string[],
  _title: string,
  _body: string,
  _data?: Record<string, string>,
  _imageUrl?: string
) => {
  // Firebase removed
  logger.info('FCM push (mocked) summary for multiple users', { userCount: userIds.length });
  return { sent: 0, failed: 0, invalidTokens: [] };
};

export const createNotificationWithPreferences = async (params: {
  recipient: string | any;
  type: NotificationType;
  title: string;
  message: string;
  relatedAnnouncement?: any;
  relatedClassLead?: any;
}) => {
  const { recipient, type, title, message, relatedAnnouncement, relatedClassLead } = params;

  // Normalize recipient to a userId string (can be string, ObjectId, or full user object)
  let userId: string;
  if (typeof recipient === 'string') {
    userId = recipient;
  } else if (recipient && typeof recipient === 'object') {
    const anyRecipient: any = recipient;
    userId = String(anyRecipient._id || anyRecipient.id);
  } else {
    userId = String(recipient);
  }

  const prefs = await getUserPreferences(userId);
  const enabled = prefs.notificationPreferences?.[type];
  if (!enabled) return null;

  const notification = await Notification.create({
    recipient: userId,
    type,
    title,
    message,
    relatedAnnouncement,
    relatedClassLead,
  });

  // Push notification step mocked out
  
  return notification;
};
