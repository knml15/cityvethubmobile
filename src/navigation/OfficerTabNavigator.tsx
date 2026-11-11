import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../theme';
import SettingsScreen from '../screens/Profile/SettingsScreen';
import NotificationBell from '../components/NotificationBell';

import FieldLookupScreen from '../screens/Officer/FieldLookupScreen';
import FieldIncidentScreen from '../screens/Officer/FieldIncidentScreen';
import OcularQueueScreen from '../screens/Officer/OcularQueueScreen';
import CommunityScreen from '../screens/Community/CommunityScreen';
import { OfficerTabParamList } from './types';

const Tab = createBottomTabNavigator<OfficerTabParamList>();

export default function OfficerTabNavigator() {
  const insets = useSafeAreaInsets();
  const colors = useAppPalette();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerRight: () => (
          <View style={{ marginRight: 8 }}>
            <NotificationBell />
          </View>
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingTop: 5,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          height: 56 + Math.max(8, insets.bottom),
        },
      }}
    >
      <Tab.Screen
        name="FieldLookup"
        component={FieldLookupScreen}
        options={{
          headerShown: false,
          title: 'QR Lookup & Medical',
          tabBarLabel: 'QR & Medical',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🔍</Text>
          ),
        }}
      />
      <Tab.Screen
        name="FieldIncidents"
        component={FieldIncidentScreen}
        options={{
          headerShown: false,
          title: 'Incident Surveillance',
          tabBarLabel: 'Surveillance',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🗺️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="OcularQueue"
        component={OcularQueueScreen}
        options={{
          headerShown: false,
          title: 'Staff Alerts & Profile',
          tabBarLabel: 'Staff Alerts',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🚨</Text>
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
            <Text style={{ color, fontSize: 17 }}>💬</Text>
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