import Notification from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';

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
