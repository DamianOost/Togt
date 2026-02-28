import React, { useEffect, useRef } from 'react';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { useNavigationContainerRef } from '@react-navigation/native';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setTokenGetter } from './src/services/api';
import { registerForPushNotifications, setupNotificationListeners } from './src/services/notificationService';

// Wire up token getter after store is ready
function TokenWirer() {
  useEffect(() => {
    setTokenGetter(() => store.getState().auth.accessToken);
  }, []);
  return null;
}

// Register push notifications once logged in
function PushNotificationSetup() {
  const { user } = useSelector((s) => s.auth);
  const navigationRef = useNavigationContainerRef?.() || { navigate: () => {} };

  useEffect(() => {
    if (!user) return;

    // Register device for push
    registerForPushNotifications();

    // Handle notification taps — navigate to the right screen
    const cleanup = setupNotificationListeners((data) => {
      if (!data?.screen) return;
      try {
        if (data.screen === 'ActiveBooking' && data.bookingId) {
          navigationRef.navigate('ActiveBooking', { bookingId: data.bookingId });
        } else if (data.screen === 'JobRequests') {
          navigationRef.navigate('JobRequests');
        } else if (data.screen === 'Rate' && data.bookingId) {
          navigationRef.navigate('Rate', { bookingId: data.bookingId });
        } else if (data.screen === 'MyBookings') {
          navigationRef.navigate('MyBookings');
        } else if (data.screen === 'Dashboard') {
          navigationRef.navigate('Dashboard');
        }
      } catch (e) {
        // Navigation not ready yet — ignore
      }
    });

    return cleanup;
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
