import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import AuthStack from './AuthStack';
import CustomerStack from './CustomerStack';
import LabourerStack from './LabourerStack';

const RootStack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user } = useSelector((state) => state.auth);

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <RootStack.Screen name="Auth" component={AuthStack} />
        ) : user.role === 'customer' ? (
          <RootStack.Screen name="Customer" component={CustomerStack} />
        ) : (
          <RootStack.Screen name="Labourer" component={LabourerStack} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
