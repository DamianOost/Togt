import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DashboardScreen from '../screens/labourer/DashboardScreen';
import ProfileSetupScreen from '../screens/labourer/ProfileSetupScreen';
import JobRequestsScreen from '../screens/labourer/JobRequestsScreen';
import ActiveJobScreen from '../screens/labourer/ActiveJobScreen';
import EarningsScreen from '../screens/labourer/EarningsScreen';

const Stack = createNativeStackNavigator();

export default function LabourerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1A6B3A' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'My Dashboard' }} />
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="JobRequests" component={JobRequestsScreen} options={{ title: 'Job Requests' }} />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} options={{ title: 'Active Job' }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Earnings' }} />
    </Stack.Navigator>
  );
}
