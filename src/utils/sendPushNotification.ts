import logger from './logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

const isValidExpoToken = (token: string | null | undefined): token is string =>
  typeof token === 'string' &&
  (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['));

/** Send a single Expo push notification. Never throws. */
export const sendPushNotification = async (
  expoPushToken: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> => {
  if (!isValidExpoToken(expoPushToken)) {
    logger.warn('[Push] Skipped — invalid or missing token', { expoPushToken });
    return;
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: expoPushToken, title, body, data, sound: 'default' }),
    });
    const json = await res.json() as any;
    const ticket = json?.data;
    if (ticket?.status === 'error') {
      logger.error('[Push] Expo rejected ticket', { error: ticket.message, details: ticket.details, token: expoPushToken });
    } else {
      logger.info('[Push] Sent', { token: expoPushToken, title });
    }
  } catch (err) {
    logger.error('[Push] Network error sending to Expo', { err, token: expoPushToken });
  }
};

/**
 * Send push notifications to many users at once using Expo's batch API.
 * Splits into chunks of 100. Never throws — logs failures per chunk.
 */
export const sendPushToMany = async (
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> => {
  const valid = tokens.filter(isValidExpoToken) as string[];
  if (valid.length === 0) {
    logger.warn('[Push] sendPushToMany — no valid tokens', { total: tokens.length });
    return;
  }

  logger.info(`[Push] Sending to ${valid.length} devices (${tokens.length - valid.length} skipped — no token)`);

  // Chunk into batches of 100
  for (let i = 0; i < valid.length; i += EXPO_BATCH_SIZE) {
    const chunk = valid.slice(i, i + EXPO_BATCH_SIZE);
    const messages = chunk.map((to) => ({ to, title, body, data, sound: 'default' }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const json = await res.json() as any;
      const tickets: any[] = json?.data ?? [];
      const errors = tickets.filter((t) => t.status === 'error');
      if (errors.length) {
        errors.forEach((t, i) => {
          logger.error(`[Push] Ticket error #${i + 1}: ${t.message} | code: ${t.details?.error ?? 'unknown'} | fault: ${t.details?.fault ?? '-'}`);
        });
      } else {
        logger.info(`[Push] Batch of ${chunk.length} delivered successfully`);
      }
    } catch (err) {
      logger.error('[Push] Network error on batch', { batchStart: i, err });
    }
  }
};
