import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import HomeMapScreen from '../screens/customer/HomeMapScreen';
import LabourerProfileScreen from '../screens/customer/LabourerProfileScreen';
import BookingFormScreen from '../screens/customer/BookingFormScreen';
import ActiveBookingScreen from '../screens/customer/ActiveBookingScreen';
import PaymentScreen from '../screens/customer/PaymentScreen';
import RateScreen from '../screens/customer/RateScreen';
import MyBookingsScreen from '../screens/customer/MyBookingsScreen';
import DiscoverScreen from '../screens/customer/DiscoverScreen';
import ChatScreen from '../screens/shared/ChatScreen';
import KYCScreen from '../screens/shared/KYCScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1a1a2e' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: 'bold' },
};

// Home stack (Map + Labourer Profile + Booking + Active + Payment + Rate + Chat)
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="HomeMap" component={HomeMapScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LabourerProfile" component={LabourerProfileScreen} options={{ title: 'Labourer Profile' }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ title: 'Book Now' }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Leave a Rating' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat', headerShown: false }} />
      <Stack.Screen name="KYC" component={KYCScreen} options={{ title: 'Verify Identity', headerShown: false }} />
    </Stack.Navigator>
  );
}

// Bookings stack
function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MyBookingsMain" component={MyBookingsScreen} options={{ title: 'My Bookings' }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Leave a Rating' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat', headerShown: false }} />
    </Stack.Navigator>
  );
}

// Discover stack
function DiscoverStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DiscoverMain" component={DiscoverScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LabourerProfile" component={LabourerProfileScreen} options={{ title: 'Labourer Profile' }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ title: 'Book Now' }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Leave a Rating' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat', headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function CustomerStack() {
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
            Search: '🗺️',
            Discover: '🔍',
            Bookings: '📋',
          };
          return <Text style={{ fontSize: 22 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Search" component={HomeStack} options={{ tabBarLabel: 'Map' }} />
      <Tab.Screen name="Discover" component={DiscoverStack} />
      <Tab.Screen name="Bookings" component={BookingsStack} />
    </Tab.Navigator>
  );
}
