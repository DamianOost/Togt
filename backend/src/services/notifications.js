const { Expo } = require('expo-server-sdk');
const db = require('../config/db');

const expo = new Expo();

/**
 * Send a push notification to a user.
 * @param {string} userId - Target user's UUID
 * @param {string} title
 * @param {string} body
 * @param {object} data - Extra payload sent to the app
 */
async function notifyUser(userId, title, body, data = {}) {
  try {
    const result = await db.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId],
    );
    const token = result.rows[0]?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) return;

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
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[notifications] Failed to send push:', err.message);
  }
}

module.exports = { notifyUser };
