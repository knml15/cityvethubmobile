import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { account, APPWRITE_PUSH_PROVIDER_ID } from '../api/client';
import { useAuthStore } from '../store';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn('Notification handler setup notice:', err);
}

async function getStableTargetId(userId: string): Promise<string> {
  const cleanUser = String(userId || '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24);
  const baseId = `pt_${cleanUser || 'device'}`.slice(0, 36);
  const storeKey = `cvh_push_target_${cleanUser || 'default'}`;

  try {
    const saved = await SecureStore.getItemAsync(storeKey);
    if (saved && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,35}$/.test(saved)) {
      return saved;
    }
    await SecureStore.setItemAsync(storeKey, baseId);
  } catch {
    // Fallback to deterministic target ID if SecureStore is unavailable
  }

  return baseId;
}

/**
 * Registers the device's native push token (FCM on Android / APNs on iOS)
 * as an Appwrite Messaging push target on the currently authenticated account.
 * Safely catches and logs warnings when running inside Expo Go or without native FCM config.
 */
export async function registerDevicePushTarget(userId: string): Promise<string | null> {
  try {
    if (!userId) return null;
    if (useAuthStore.getState().user?.pushNotificationsEnabled === false) {
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CityVetHub Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00AEEF',
      });
    }

    const existingPerm = await Notifications.getPermissionsAsync();
    let finalStatus = existingPerm.status;

    if (finalStatus !== 'granted') {
      const requestedPerm = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPerm.status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenData = await Notifications.getDevicePushTokenAsync();
    const tokenString = String(tokenData?.data || '').trim();
    if (!tokenString) {
      return null;
    }

    const targetId = await getStableTargetId(userId);

    try {
      await account.createPushTarget(targetId, tokenString, APPWRITE_PUSH_PROVIDER_ID);
    } catch (createErr: any) {
      const code = Number(createErr?.code || 0);
      const msg = String(createErr?.message || '').toLowerCase();
      if (
        code === 409 ||
        msg.includes('already exists') ||
        msg.includes('target_already_exists') ||
        msg.includes('push target')
      ) {
        await account.updatePushTarget(targetId, tokenString);
      } else {
        throw createErr;
      }
    }

    return targetId;
  } catch (err) {
    console.warn(
      'Push notification registration skipped (Expo Go or missing native FCM configuration):',
      err
    );
    return null;
  }
}
