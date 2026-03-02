import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import DashboardScreen from '../screens/labourer/DashboardScreen';
import ProfileSetupScreen from '../screens/labourer/ProfileSetupScreen';
import JobRequestsScreen from '../screens/labourer/JobRequestsScreen';
import ActiveJobScreen from '../screens/labourer/ActiveJobScreen';
import EarningsScreen from '../screens/labourer/EarningsScreen';
import ServicesScreen from '../screens/labourer/ServicesScreen';
import ChatScreen from '../screens/shared/ChatScreen';
import KYCScreen from '../screens/shared/KYCScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1a1a2e' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: 'bold' },
};

// Dashboard stack (Dashboard + ActiveJob + Chat)
function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} options={{ title: 'Active Job' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat', headerShown: false }} />
      <Stack.Screen name="KYC" component={KYCScreen} options={{ title: 'Verify Identity', headerShown: false }} />
    </Stack.Navigator>
  );
}

// Jobs stack
function JobsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="JobRequestsMain" component={JobRequestsScreen} options={{ title: 'Job Requests' }} />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} options={{ title: 'Active Job' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat', headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function LabourerStack() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 58, backgroundColor: '#1a1a2e', borderTopColor: '#374151' },
        tabBarIcon: ({ focused }) => {
          const icons = {
            Home: '🏠',
            Jobs: '📋',
            Services: '🛠️',
            Profile: '👤',
            Earnings: '💰',
          };
          return <Text style={{ fontSize: 22 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardStack} />
      <Tab.Screen name="Jobs" component={JobsStack} />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          ...screenOptions,
          headerShown: true,
          title: 'My Services',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileSetupScreen}
        options={{
          ...screenOptions,
          headerShown: true,
          title: 'My Profile',
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          ...screenOptions,
          headerShown: true,
          title: 'Earnings',
        }}
      />
    </Tab.Navigator>
  );
}
