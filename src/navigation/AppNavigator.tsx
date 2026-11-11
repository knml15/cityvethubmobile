import React, { useEffect } from 'react';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useAppPalette } from '../theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import OwnedPetPassportScreen from '../screens/Profile/OwnedPetPassportScreen';
import { buildPetDetailPayload } from '../components/NotificationBell';

// Navigators
import TabNavigator from './TabNavigator';
import OfficerTabNavigator from './OfficerTabNavigator';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Pet Adoption Detail Screen
import PetDetailScreen from '../screens/Adoption/PetDetailScreen';

// Global Auth State
import { useAuthStore, useAdoptionStore } from '../store';

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuthStore();
  const colors = useAppPalette();
  const navTheme = {
    ...(user?.theme === 'dark' ? DarkTheme : DefaultTheme),
    colors: { ...(user?.theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background, card: colors.surface, text: colors.text,
      border: colors.border, primary: colors.primary },
  };

  const isOfficer =
    user?.contractRole === 'officer' ||
    user?.role === 'VET_OFFICER' ||
    user?.role === 'CVO_ADMIN';

  useEffect(() => {
    if (!isAuthenticated) return;

    let responseSub: Notifications.EventSubscription | null = null;
    try {
      responseSub = Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const data = response?.notification?.request?.content?.data as
            | Record<string, any>
            | undefined;
          if (!data) return;

          if (data.type === 'adoption_match' && data.listingId) {
            const targetListingId = String(data.listingId);
            let matched = useAdoptionStore
              .getState()
              .availablePets.find(
                (item) => String(item.listingId || item.id) === targetListingId
              );

            if (!matched) {
              await useAdoptionStore.getState().fetchAvailablePets();
              matched = useAdoptionStore
                .getState()
                .availablePets.find(
                  (item) =>
                    String(item.listingId || item.id) === targetListingId
                );
            }

            if (navigationRef.isReady()) {
              const detailPayload = matched
                ? buildPetDetailPayload(matched, user?.id)
                : null;
              if (detailPayload) {
                navigationRef.navigate('PetDetail', detailPayload);
              } else if (!isOfficer) {
                navigationRef.navigate('MainApp');
              }
            }
          }
        }
      );
    } catch (err) {
      console.warn('Notification response listener skipped:', err);
    }

    return () => {
      try {
        responseSub?.remove();
      } catch {
        // Ignore cleanup errors in Expo Go
      }
    };
  }, [isAuthenticated, user?.id, isOfficer]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        ) : isOfficer ? (
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