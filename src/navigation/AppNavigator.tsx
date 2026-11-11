import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useAppPalette } from '../theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import OwnedPetPassportScreen from '../screens/Profile/OwnedPetPassportScreen';

// Navigators
import TabNavigator from './TabNavigator';
import OfficerTabNavigator from './OfficerTabNavigator';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Pet Adoption Detail Screen
import PetDetailScreen from '../screens/Adoption/PetDetailScreen';

// Global Auth State
import { useAuthStore } from '../store';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuthStore();
  const colors = useAppPalette();
  const navTheme = {
    ...(user?.theme === 'dark' ? DarkTheme : DefaultTheme),
    colors: { ...(user?.theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background, card: colors.surface, text: colors.text,
      border: colors.border, primary: colors.primary },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        ) : user?.contractRole === 'officer' ? (
          // Approved Field Officer Workflows (cityvethub-field-officers Team Member)
          <Stack.Group>
            <Stack.Screen name="OfficerApp" component={OfficerTabNavigator} />
            <Stack.Screen
              name="PetDetail"
              component={PetDetailScreen}
              options={{
                headerShown: true,
                title: 'Listing Details (Read-Only)',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
          </Stack.Group>
        ) : (
          // Pet Owner Workflows
          <Stack.Group>
            <Stack.Screen name="MainApp" component={TabNavigator} />
            <Stack.Screen
              name="PetDetail"
              component={PetDetailScreen}
              options={{
                headerShown: true,
                title: 'Adoption Listing',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="OwnedPetPassport"
              component={OwnedPetPassportScreen}
              options={{
                headerShown: true,
                title: 'My Pet & QR Passport',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}