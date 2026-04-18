class Expo {
  static isExpoPushToken() { return true; }
  async sendPushNotificationsAsync() { return []; }
  chunkPushNotifications(messages) { return [messages]; }
}
module.exports = { Expo };
