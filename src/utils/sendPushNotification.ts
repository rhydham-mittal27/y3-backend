import admin from '../config/firebase';
import logger from './logger';

const CHUNK_SIZE = 500; // FCM multicast limit

/** Send a push notification to a single FCM token. Never throws. */
export const sendPushNotification = async (
  fcmToken: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> => {
  if (!fcmToken) {
    logger.warn('[Push] Skipped — no FCM token');
    return;
  }
  if (!admin.apps.length) {
    logger.warn('[Push] Skipped — Firebase not initialized');
    return;
  }
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body }, data, android: { priority: 'high' }, apns: { payload: { aps: { sound: 'default' } } } });
    logger.info('[Push] Sent to single device');
  } catch (err: any) {
    logger.error('[Push] Failed to send', { error: err?.message, code: err?.code });
  }
};

/**
 * Send push notifications to many FCM tokens using Firebase Admin multicast.
 * Chunks into batches of 500. Never throws.
 */
export const sendPushToMany = async (
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> => {
  if (!admin.apps.length) {
    logger.warn('[Push] sendPushToMany skipped — Firebase not initialized. Is firebase-service-account.json present on the server?');
    return;
  }

  const valid = tokens.filter((t): t is string => typeof t === 'string' && t.length > 10);
  if (valid.length === 0) {
    logger.warn('[Push] sendPushToMany — no valid FCM tokens', { total: tokens.length });
    return;
  }

  logger.info(`[Push] Sending to ${valid.length} devices (${tokens.length - valid.length} skipped — no token)`);

  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const result = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      const failures = result.responses.filter((r) => !r.success);
      if (failures.length) {
        failures.forEach((r) => logger.error(`[Push] FCM error: ${r.error?.message} | code: ${r.error?.code}`));
      }
      logger.info(`[Push] Batch result: ${result.successCount} sent, ${result.failureCount} failed`);
    } catch (err: any) {
      logger.error('[Push] Batch send error', { error: err?.message, code: err?.code });
    }
  }
};
