import Notification, { NotificationType } from '../models/Notification';
import ErrorResponse from '../utils/errorResponse';
import { getUserPreferences } from './settingsService';
import User from '../models/User';
import { firebaseMessaging } from '../config/firebase';
import logger from '../utils/logger';
import { FCM_CONFIG } from '../config/constants';
import admin from 'firebase-admin';

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
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string
) => {
  const message: admin.messaging.TokenMessage = {
    token: fcmToken,
    notification: {
      title,
      body,
      imageUrl,
    },
    data,
    android: {
      priority: 'high',
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
    },
  } as any;

  try {
    const response = await firebaseMessaging.send(message);
    logger.info('FCM push sent to single device', { fcmToken, response });
    return { success: true };
  } catch (error) {
    logger.error('Failed to send FCM push to device', { fcmToken, error });
    return { success: false, error };
  }
};

export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string
) => {
  const user = await User.findById(userId).select('devices');
  if (!user || !user.devices || user.devices.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] as string[] };
  }

  const tokens = user.devices
    .filter((d: any) => !!d.fcmToken)
    .map((d: any) => d.fcmToken as string);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] as string[] };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += FCM_CONFIG.MAX_TOKENS_PER_BATCH) {
    chunks.push(tokens.slice(i, i + FCM_CONFIG.MAX_TOKENS_PER_BATCH));
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const batch of chunks) {
    const message = {
      tokens: batch,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    } as any;

    try {
      const response = await firebaseMessaging.sendEachForMulticast(message);
      response.responses.forEach((r: any, index: number) => {
        if (r.success) {
          sent += 1;
        } else {
          failed += 1;
          const code = (r.error as any)?.code as string | undefined;
          if (code && (code.includes('registration-token-not-registered') || code.includes('invalid-registration'))) {
            invalidTokens.push(batch[index]);
          }
        }
      });
    } catch (error) {
      failed += batch.length;
      logger.error('Failed to send FCM multicast batch', { error });
    }
  }

  if (invalidTokens.length > 0 && user.devices) {
    user.devices = user.devices.filter((d: any) => !invalidTokens.includes(d.fcmToken));
    await user.save();
  }

  logger.info('FCM push summary for user', { userId, sent, failed, invalidTokensCount: invalidTokens.length });

  return { sent, failed, invalidTokens };
};

export const sendPushToMultipleUsers = async (
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string
) => {
  const users = await User.find({ _id: { $in: userIds } }).select('devices');
  const tokens: string[] = [];

  users.forEach((user) => {
    if (user.devices && user.devices.length > 0) {
      user.devices.forEach((d: any) => {
        if (d.fcmToken) tokens.push(d.fcmToken as string);
      });
    }
  });

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] as string[] };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += FCM_CONFIG.MAX_TOKENS_PER_BATCH) {
    chunks.push(tokens.slice(i, i + FCM_CONFIG.MAX_TOKENS_PER_BATCH));
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const batch of chunks) {
    const message = {
      tokens: batch,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    } as any;

    try {
      const response = await firebaseMessaging.sendEachForMulticast(message);
      response.responses.forEach((r, index) => {
        if (r.success) {
          sent += 1;
        } else {
          failed += 1;
          const code = (r.error as any)?.code as string | undefined;
          if (code && (code.includes('registration-token-not-registered') || code.includes('invalid-registration'))) {
            invalidTokens.push(batch[index]);
          }
        }
      });
    } catch (error) {
      failed += batch.length;
      logger.error('Failed to send FCM multicast batch (multi-user)', { error });
    }
  }

  if (invalidTokens.length > 0) {
    await User.updateMany(
      {},
      {
        $pull: {
          devices: {
            fcmToken: { $in: invalidTokens },
          },
        },
      }
    );
  }

  logger.info('FCM push summary for multiple users', { userCount: userIds.length, sent, failed, invalidTokensCount: invalidTokens.length });

  return { sent, failed, invalidTokens };
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

  const prefs = await getUserPreferences(String(recipient));
  const enabled = prefs.notificationPreferences?.[type];
  if (!enabled) return null;

  const notification = await Notification.create({
    recipient,
    type,
    title,
    message,
    relatedAnnouncement,
    relatedClassLead,
  });

  try {
    const data: Record<string, string> = {
      notificationId: String(notification._id),
      type,
    };
    await sendPushNotification(String(recipient), title, message, data);
  } catch (error) {
    logger.error('Failed to send push notification after creating in-app notification', {
      error,
      notificationId: notification._id,
      recipient,
    });
  }

  return notification;
};
