import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setAuthHandlers } from './src/services/api';
import { restoreSessionThunk, logoutThunk, refreshTokensThunk } from './src/store/authSlice';

// Wire api.js into Redux + SecureStore
function AuthWirer() {
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => store.getState().auth.accessToken,
      refreshAndStore: async () => {
        // unwrap throws if the thunk rejects (expired/revoked refresh token).
        return store.dispatch(refreshTokensThunk()).unwrap();
      },
      onLogout: () => store.dispatch(logoutThunk()),
    });
  }, []);
  return null;
}

// Restore auth session from device storage
function SessionRestorer({ children }) {
  const dispatch = useDispatch();
  const { restored } = useSelector((s) => s.auth);

  useEffect(() => {
    dispatch(restoreSessionThunk());
  }, []);

  if (!restored) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#1A6B3A" />
      </View>
    );
  }

  return children;
}

export default function App() {
  return (
    <Provider store={store}>
      <AuthWirer />
      <StatusBar style="light" />
      <SessionRestorer>
        <AppNavigator />
      </SessionRestorer>
    </Provider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
