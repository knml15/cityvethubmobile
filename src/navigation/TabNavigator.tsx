import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../theme';
import SettingsScreen from '../screens/Profile/SettingsScreen';

// Pet Owner Screens
import AdoptionFeed from '../screens/Adoption/AdoptionFeed';
import DiseaseMap from '../screens/Surveillance/DiseaseMap';
import CommunityScreen from '../screens/Community/CommunityScreen';
import UserProfileScreen from '../screens/Profile/UserProfileScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const colors = useAppPalette();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          height: 56 + Math.max(8, insets.bottom),
        },
      }}
    >
      <Tab.Screen
        name="AdoptionFeed"
        component={AdoptionFeed}
        options={{
          title: 'Pet Adoptions',
          tabBarLabel: 'Adoptions',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🐾</Text>
          ),
        }}
      />
      <Tab.Screen
        name="SurveillanceMap"
        component={DiseaseMap}
        options={{
          title: 'Report an Incident',
          tabBarLabel: 'Incidents',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📍</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          title: 'Community & CVO Notices',
          tabBarLabel: 'Community',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          title: 'My Pets & Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>👤</Text>
          ),
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{
        title: 'Settings', tabBarLabel: 'Settings',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
      }}/>
    </Tab.Navigator>
  );
}