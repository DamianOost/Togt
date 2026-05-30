import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import AuthStack from './AuthStack';
import CustomerStack from './CustomerStack';
import LabourerStack from './LabourerStack';
import IncomingMatchModal from '../components/IncomingMatchModal';

const RootStack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, accessToken } = useSelector((state) => state.auth);
  const isAuthed = Boolean(user && accessToken);

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthed ? (
          <RootStack.Screen name="Auth" component={AuthStack} navigationKey="auth" />
        ) : user.role === 'customer' ? (
          <RootStack.Screen name="Customer" component={CustomerStack} navigationKey="customer" />
        ) : (
          <RootStack.Screen name="Labourer" component={LabourerStack} navigationKey="labourer" />
        )}
      </RootStack.Navigator>
      <IncomingMatchModal />
    </NavigationContainer>
  );
}
