import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';

import AuthStack from './AuthStack';
import CustomerStack from './CustomerStack';
import LabourerStack from './LabourerStack';
import IncomingMatchModal from '../components/IncomingMatchModal';
import { logoutThunk } from '../store/authSlice';

const { selectAuthorizedShell } = require('../auth/sessionRestore');

const RootStack = createNativeStackNavigator();

function UnsupportedAccountScreen() {
  const dispatch = useDispatch();
  return (
    <View style={styles.unsupportedCanvas}>
      <View style={styles.unsupportedCard} accessibilityLiveRegion="assertive">
        <Text style={styles.unsupportedLabel}>ACCOUNT ACCESS</Text>
        <Text style={styles.unsupportedTitle}>This account role is not supported</Text>
        <Text style={styles.unsupportedDetail}>
          TOGT has kept this account locked instead of opening the wrong workspace. Sign in again or contact support.
        </Text>
        <TouchableOpacity
          style={styles.unsupportedButton}
          onPress={() => dispatch(logoutThunk())}
          accessibilityRole="button"
        >
          <Text style={styles.unsupportedButtonText}>Return to sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { user, accessToken, restoreStatus } = useSelector((state) => state.auth);
  const shell = selectAuthorizedShell({ restoreStatus, user, accessToken });

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {shell === 'auth' ? (
          <RootStack.Screen name="Auth" component={AuthStack} navigationKey="auth" />
        ) : shell === 'customer' ? (
          <RootStack.Screen name="Customer" component={CustomerStack} navigationKey="customer" />
        ) : shell === 'labourer' ? (
          <RootStack.Screen name="Labourer" component={LabourerStack} navigationKey="labourer" />
        ) : (
          <RootStack.Screen
            name="UnsupportedAccount"
            component={UnsupportedAccountScreen}
            navigationKey="unsupported"
          />
        )}
      </RootStack.Navigator>
      {shell === 'labourer' ? <IncomingMatchModal /> : null}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  unsupportedCanvas: {
    flex: 1,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unsupportedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DED9',
    borderRadius: 24,
    padding: 24,
  },
  unsupportedLabel: {
    color: '#B42318',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  unsupportedTitle: {
    color: '#0F1F1B',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  unsupportedDetail: {
    color: '#4E5C57',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 24,
  },
  unsupportedButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#12844E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  unsupportedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
});
