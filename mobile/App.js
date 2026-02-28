import React, { useEffect } from 'react';
import { Provider, useSelector } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setTokenGetter } from './src/services/api';

// Wire up token getter after store is ready
function TokenWirer() {
  useEffect(() => {
    setTokenGetter(() => store.getState().auth.accessToken);
  }, []);
  return null;
}

// Register push notifications once logged in
// NOTE: Push notifications are NOT supported in Expo Go (SDK 53+).
// They will work in development builds and production builds.
function PushNotificationSetup() {
  const auth = useSelector((s) => s.auth);
  const user = auth?.user;

  useEffect(() => {
    if (!user) return;

    let cleanup = () => {};

    async function setup() {
      try {
        const { registerForPushNotifications, setupNotificationListeners } =
          await import('./src/services/notificationService');

        await registerForPushNotifications();

        cleanup = setupNotificationListeners((data) => {
          // Navigation on tap will be wired up with development builds
          console.log('[notifications] Tapped:', data);
        });
      } catch (e) {
        // Expected in Expo Go — push notifications not available
        console.log('[notifications] Not available (Expo Go):', e.message);
      }
    }

    setup();
    return () => cleanup();
  }, [user]);

  return null;
}

export default function App() {
  return (
    <Provider store={store}>
      <TokenWirer />
      <PushNotificationSetup />
      <StatusBar style="light" />
      <AppNavigator />
    </Provider>
  );
}
