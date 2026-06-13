/**
 * Sends a push notification via Expo's push API.
 * No SDK needed — plain HTTP POST to the Expo push endpoint.
 * Silently swallows errors so a failed push never breaks the main request.
 */
export const sendPushNotification = async (
  expoPushToken: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> => {
  if (!expoPushToken) return;
  if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: expoPushToken, title, body, data, sound: 'default' }),
    });
  } catch (_) {
    // Never block the main request on a push failure
  }
};
