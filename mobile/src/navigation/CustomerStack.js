import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeMapScreen from '../screens/customer/HomeMapScreen';
import RequestMatchScreen from '../screens/customer/RequestMatchScreen';
import LabourerProfileScreen from '../screens/customer/LabourerProfileScreen';
import BookingFormScreen from '../screens/customer/BookingFormScreen';
import ActiveBookingScreen from '../screens/customer/ActiveBookingScreen';
import PaymentScreen from '../screens/customer/PaymentScreen';
import RateScreen from '../screens/customer/RateScreen';
import MyBookingsScreen from '../screens/customer/MyBookingsScreen';
import DiscoverScreen from '../screens/customer/DiscoverScreen';
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

// A one-screen stack preserves the existing tab navigation hierarchy while
// transactional routes live once, above the tabs.
function HomeTabStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMap" component={HomeMapScreen} />
    </Stack.Navigator>
  );
}

function BookingsTabStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MyBookingsMain" component={MyBookingsScreen} options={{ title: 'My Bookings' }} />
    </Stack.Navigator>
  );
}

function DiscoverTabStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DiscoverMain" component={DiscoverScreen} />
    </Stack.Navigator>
  );
}

function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#12844E',
        tabBarInactiveTintColor: '#4E5C57',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: {
          paddingBottom: 6,
          paddingTop: 5,
          minHeight: 62,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#D6DED9',
        },
        tabBarIcon: () => {
          const icons = {
            Search: '🗺️',
            Discover: '🔍',
            Bookings: '📋',
          };
          return <Text style={{ fontSize: 21 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Search" component={HomeTabStack} options={{ tabBarLabel: 'Map' }} />
      <Tab.Screen name="Discover" component={DiscoverTabStack} />
      <Tab.Screen name="Bookings" component={BookingsTabStack} />
    </Tab.Navigator>
  );
}

export default function CustomerStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RequestMatch" component={RequestMatchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LabourerProfile" component={LabourerProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Leave a Rating' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="KYC" component={KYCScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ScopeConfirm" component={ScopeConfirmScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
