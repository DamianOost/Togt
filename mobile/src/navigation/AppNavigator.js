import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { DefaultTheme, getStateFromPath, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';

import AuthStack from './AuthStack';
import CustomerStack from './CustomerStack';
import LabourerStack from './LabourerStack';
import GroundedCustomerStack from './GroundedCustomerStack';
import GroundedWorkerStack from './GroundedWorkerStack';
import IncomingMatchModal from '../components/IncomingMatchModal';
import { GroundedIncomingOfferListener } from '../features/worker/integration';
import { logoutThunk } from '../store/authSlice';
import { useTogtTheme } from '../design';
import { AppScaffold, Button, Surface } from '../ui';
import { packagedFeatureEnabled } from '../app/runtimeFeatureFlags';

const { selectAuthorizedShell } = require('../auth/sessionRestore');
const { createTogtLinkingConfiguration } = require('./linkingConfig.cjs');

const RootStack = createNativeStackNavigator();

function UnsupportedAccountScreen() {
  const dispatch = useDispatch();
  const theme = useTogtTheme();

  return (
    <AppScaffold contentContainerStyle={styles.unsupportedCanvas}>
      <Surface elevation="card" style={{ padding: theme.spacing.xl }}>
        <Text
          allowFontScaling
          style={[theme.typography.label, { color: theme.colors.error }]}
        >
          Account access
        </Text>
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="header"
          allowFontScaling
          style={[
            theme.typography.h1,
            { color: theme.colors.text, marginTop: theme.spacing.xs },
          ]}
        >
          This account role is not supported
        </Text>
        <Text
          allowFontScaling
          style={[
            theme.typography.body,
            {
              color: theme.colors.textSecondary,
              marginBottom: theme.spacing.xl,
              marginTop: theme.spacing.sm,
            },
          ]}
        >
          TOGT has kept this account locked instead of opening the wrong workspace. Sign in again or contact support.
        </Text>
        <Button
          fullWidth
          label="Return to sign in"
          onPress={() => dispatch(logoutThunk())}
        />
      </Surface>
    </AppScaffold>
  );
}

// The incoming-offer modal needs the root navigator context so it can open
// the single registered Labourer → ActiveJob route after an accepted offer.
function LabourerRoot() {
  const groundedWorker = packagedFeatureEnabled('workerExperience');
  const WorkerStack = groundedWorker
    ? GroundedWorkerStack
    : LabourerStack;
  return (
    <>
      <WorkerStack />
      {groundedWorker ? <GroundedIncomingOfferListener /> : <IncomingMatchModal />}
    </>
  );
}

export default function AppNavigator() {
  const { user, accessToken, restoreStatus } = useSelector((state) => state.auth);
  const shell = selectAuthorizedShell({ restoreStatus, user, accessToken });
  const theme = useTogtTheme();
  const groundedCustomer = packagedFeatureEnabled('customerFlagship');
  const groundedWorker = packagedFeatureEnabled('workerExperience');
  const CustomerRoleStack = groundedCustomer
    ? GroundedCustomerStack
    : CustomerStack;
  const linking = useMemo(() => createTogtLinkingConfiguration({
    groundedCustomer,
    groundedWorker,
    shell,
    stateFromPath: getStateFromPath,
  }), [groundedCustomer, groundedWorker, shell]);
  const navigationTheme = useMemo(() => ({
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.canvas,
      border: theme.colors.border,
      card: theme.colors.surface,
      notification: theme.colors.attention,
      primary: theme.colors.actionPrimary,
      text: theme.colors.text,
    },
  }), [theme]);

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {shell === 'auth' ? (
          <RootStack.Screen name="Auth" component={AuthStack} navigationKey="auth" />
        ) : shell === 'customer' ? (
          <RootStack.Screen name="Customer" component={CustomerRoleStack} navigationKey="customer" />
        ) : shell === 'labourer' ? (
          <RootStack.Screen name="Labourer" component={LabourerRoot} navigationKey="labourer" />
        ) : (
          <RootStack.Screen
            name="UnsupportedAccount"
            component={UnsupportedAccountScreen}
            navigationKey="unsupported"
          />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  unsupportedCanvas: {
    flex: 1,
    justifyContent: 'center',
  },
});
