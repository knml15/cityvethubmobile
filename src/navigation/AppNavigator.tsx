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

          const notifType = String(data.type || data.kind || '')
            .trim()
            .toLowerCase();

          if (notifType === 'adoption_match') {
            if (data.listingId) {
              const targetListingId = String(data.listingId);
              let matched = useAdoptionStore
                .getState()
                .availablePets.find(
                  (item) =>
                    String(item.listingId || item.id) === targetListingId
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
            } else if (navigationRef.isReady() && !isOfficer) {
              navigationRef.navigate('MainApp');
            }
            return;
          }

          if (!navigationRef.isReady()) return;

          if (notifType === 'incident_report') {
            if (isOfficer) {
              navigationRef.navigate('OfficerApp', {
                screen: 'FieldIncidents',
              });
            }
            return;
          }

          if (
            notifType === 'alert' ||
            notifType === 'outbreak' ||
            notifType === 'advisory'
          ) {
            if (isOfficer) {
              navigationRef.navigate('OfficerApp', { screen: 'OcularQueue' });
            } else {
              navigationRef.navigate('MainApp', {
                screen: 'Community',
                params: { tab: 'notices' },
              });
            }
            return;
          }

          if (
            notifType === 'community' ||
            notifType === 'post_comment' ||
            notifType === 'comment_reply' ||
            notifType === 'like_post' ||
            notifType === 'like_comment' ||
            notifType === 'join_request' ||
            notifType === 'join_status' ||
            notifType === 'announcement' ||
            notifType === 'channel_deleted' ||
            notifType === 'post_deleted'
          ) {
            const communityParams = {
              channelId: data.channelId ? String(data.channelId) : undefined,
              postId: data.postId ? String(data.postId) : undefined,
              tab: (notifType === 'channel_deleted'
                ? 'channels'
                : notifType === 'post_deleted'
                ? 'feed'
                : data.tab ||
                  (data.channelId || data.postId ? 'feed' : 'notices')) as
                | 'feed'
                | 'channels'
                | 'notices',
            };
            if (isOfficer) {
              navigationRef.navigate('OfficerApp', {
                screen: 'Community',
                params: communityParams,
              });
            } else {
              navigationRef.navigate('MainApp', {
                screen: 'Community',
                params: communityParams,
              });
            }
            return;
          }

          if (
            notifType === 'application' ||
            notifType === 'verification' ||
            notifType === 'medical' ||
            notifType === 'ownership'
          ) {
            if (isOfficer) {
              navigationRef.navigate('OfficerApp', { screen: 'FieldLookup' });
            } else {
              navigationRef.navigate('MainApp', { screen: 'UserProfile' });
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

  const themedHeaderOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerTitleStyle: { color: colors.text, fontWeight: '700' as const },
    headerBackTitle: 'Back',
  };

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
                ...themedHeaderOptions,
                title: 'Listing Details (Read-Only)',
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
                ...themedHeaderOptions,
                title: 'Adoption Listing',
              }}
            />
            <Stack.Screen
              name="OwnedPetPassport"
              component={OwnedPetPassportScreen}
              options={{
                ...themedHeaderOptions,
                title: 'My Pet & QR Passport',
              }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}