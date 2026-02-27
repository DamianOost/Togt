import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeMapScreen from '../screens/customer/HomeMapScreen';
import LabourerProfileScreen from '../screens/customer/LabourerProfileScreen';
import BookingFormScreen from '../screens/customer/BookingFormScreen';
import ActiveBookingScreen from '../screens/customer/ActiveBookingScreen';
import PaymentScreen from '../screens/customer/PaymentScreen';
import RateScreen from '../screens/customer/RateScreen';
import MyBookingsScreen from '../screens/customer/MyBookingsScreen';

const Stack = createNativeStackNavigator();

export default function CustomerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1A6B3A' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="HomeMap" component={HomeMapScreen} options={{ title: 'Find a Labourer' }} />
      <Stack.Screen name="LabourerProfile" component={LabourerProfileScreen} options={{ title: 'Labourer Profile' }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ title: 'Book Labourer' }} />
      <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} options={{ title: 'Active Booking' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="Rate" component={RateScreen} options={{ title: 'Rate Labourer' }} />
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} options={{ title: 'My Bookings' }} />
    </Stack.Navigator>
  );
}
