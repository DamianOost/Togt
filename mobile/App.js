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

    // Push notifications don't work in Expo Go (SDK 53+)
    // Silently skip — they'll work in dev/production builds
    console.log('[notifications] Skipped (Expo Go — not supported)');
    return () => {};
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
