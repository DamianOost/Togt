import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';
import { capabilityEnabled, getEffectiveCapabilities } from './capabilityService';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and save the token to the server.
 * Call this once after the user logs in.
 */
export async function registerForPushNotifications() {
  const capabilities = await getEffectiveCapabilities();
  if (!capabilityEnabled(capabilities, 'remote_push')) {
    console.info('[notifications] Remote push is unavailable in this build');
    return null;
  }

  if (!Device.isDevice) {
    console.log('[notifications] Push not available on simulator');
    return null;
  }

  // Check / request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[notifications] Push permission denied');
    return null;
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Togt',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A6B3A',
    });
  }

  const projectId = Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[notifications] Push registration skipped: EAS project ID is not configured');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save to server
    await api.post('/auth/push-token', { token });
    console.log('[notifications] Push token registered');
    return token;
  } catch (err) {
    console.error('[notifications] Failed to get/register token:', err.message);
    return null;
  }
}

/**
 * Set up foreground + tap listeners.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 * @param {function} onTap - Called with notification data when user taps
 */
export function setupNotificationListeners(onTap) {
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[notifications] Foreground:', notification.request.content.title);
  });

  const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (onTap) onTap(data);
  });

  return () => {
    foregroundSub.remove();
    tapSub.remove();
  };
}
