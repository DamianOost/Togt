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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1A6B3A' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: 'bold' },
};

// Home stack (Map + Labourer Profile + Booking + Active + Payment + Rate)
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="HomeMap" component={HomeMapScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LabourerProfile" component={LabourerProfileScreen} options={{ title: 'Labourer Profile' }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ title: 'Book Now' }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Leave a Rating' }} />
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
    </Stack.Navigator>
  );
}

export default function CustomerStack() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1A6B3A',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 58 },
        tabBarIcon: ({ focused }) => {
          const icons = {
            Search: '🔍',
            Bookings: '📋',
          };
          return <Text style={{ fontSize: 22 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Search" component={HomeStack} />
      <Tab.Screen name="Bookings" component={BookingsStack} />
    </Tab.Navigator>
  );
}
