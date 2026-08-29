import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DashboardScreen from '../screens/labourer/DashboardScreen';
import ProfileSetupScreen from '../screens/labourer/ProfileSetupScreen';
import JobRequestsScreen from '../screens/labourer/JobRequestsScreen';
import ActiveJobScreen from '../screens/labourer/ActiveJobScreen';
import EarningsScreen from '../screens/labourer/EarningsScreen';
import ServicesScreen from '../screens/labourer/ServicesScreen';
import ChatScreen from '../screens/shared/ChatScreen';
import KYCScreen from '../screens/shared/KYCScreen';
import ScopeConfirmScreen from '../screens/shared/ScopeConfirmScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#F7F4EF' },
  headerTintColor: '#0F1F1B',
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#F7F4EF' },
};

function DashboardTabStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ title: 'Dashboard' }} />
    </Stack.Navigator>
  );
}

function JobsTabStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="JobRequestsMain" component={JobRequestsScreen} options={{ title: 'Job Requests' }} />
    </Stack.Navigator>
  );
}

function LabourerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#12844E',
        tabBarInactiveTintColor: '#4E5C57',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          paddingBottom: 6,
          paddingTop: 5,
          minHeight: 62,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#D6DED9',
        },
        tabBarIcon: () => {
          const icons = {
            Home: '🏠',
            Jobs: '📋',
            Services: '🛠️',
            Profile: '👤',
            Earnings: '💰',
          };
          return <Text style={{ fontSize: 20 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardTabStack} />
      <Tab.Screen name="Jobs" component={JobsTabStack} />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          ...stackScreenOptions,
          headerShown: true,
          title: 'My Services',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileSetupScreen}
        options={{
          ...stackScreenOptions,
          headerShown: true,
          title: 'My Profile',
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          ...stackScreenOptions,
          headerShown: true,
          title: 'Earnings',
        }}
      />
    </Tab.Navigator>
  );
}

export default function LabourerStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="LabourerTabs" component={LabourerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} options={{ title: 'Active Job' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="KYC" component={KYCScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ScopeConfirm" component={ScopeConfirmScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
