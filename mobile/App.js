import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setTokenGetter } from './src/services/api';
import { restoreSessionThunk } from './src/store/authSlice';

// Wire up token getter
function TokenWirer() {
  useEffect(() => {
    setTokenGetter(() => store.getState().auth.accessToken);
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
      <TokenWirer />
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
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
