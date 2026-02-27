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

export default function App() {
  return (
    <Provider store={store}>
      <TokenWirer />
      <StatusBar style="light" />
      <AppNavigator />
    </Provider>
  );
}
