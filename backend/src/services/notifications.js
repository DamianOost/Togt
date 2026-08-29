const { Expo } = require('expo-server-sdk');
const db = require('../config/db');
const { featureAvailable } = require('../config/capabilities');

const expo = new Expo();

/**
 * Send a push notification to a user.
 * @param {string} userId - Target user's UUID
 * @param {string} title
 * @param {string} body
 * @param {object} data - Extra payload sent to the app
 */
async function notifyUser(userId, title, body, data = {}) {
  // Provider configuration and a stored token are not sufficient proof that
  // remote push is safe to use. Keep this check inside the delivery boundary
  // so every caller fails closed while the published capability is disabled.
  if (!featureAvailable('remote_push')) {
    return { delivered: false, reason: 'capability_unavailable' };
  }

  try {
    const result = await db.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId],
    );
    const token = result.rows[0]?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) {
      return { delivered: false, reason: 'valid_token_unavailable' };
    }

    const messages = [{
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }];

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    return { delivered: true };
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[notifications] Failed to send push:', err.message);
    return { delivered: false, reason: 'delivery_failed' };
  }
}

module.exports = { notifyUser };
