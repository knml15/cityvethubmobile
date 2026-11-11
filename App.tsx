import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store';
import { useAppPalette } from './src/theme';

export default function App() {
  const { isRestoring, refreshSession, user } = useAuthStore();
  const colors = useAppPalette();

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  if (isRestoring) {
    return (
      <SafeAreaProvider>
        <View style={[styles.splashContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color="#00AEEF" />
          <Text style={[styles.splashTitle, { color: colors.text }]}>City Vet Hub</Text>
          <Text style={styles.splashSub}>Restoring secure session...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={user?.theme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  splashSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6,
  },
});