import React from 'react';
import { Alert, Linking, Pressable, Text, ViewStyle } from 'react-native';

/** Does not dial automatically: asks before opening the native dialer. */
export default function CallButton({ phone, style }: { phone?: string | null; style?: ViewStyle }) {
  const normalized = String(phone || '').replace(/[^+0-9]/g, '');
  if (normalized.length < 7) return null;
  const call = () => Alert.alert('Call this number?', normalized, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Dialer', onPress: async () => {
      try { await Linking.openURL(`tel:${normalized}`); }
      catch { Alert.alert('Unavailable', 'No phone dialer was found on this device.'); }
    } },
  ]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Call ${normalized}`} onPress={call}
      style={[{ backgroundColor: '#E8F1FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
        alignItems: 'center', justifyContent: 'center' }, style]}>
    <Text style={{ color: '#2463CE', fontWeight: '700', fontSize: 12 }}>📞 Call</Text>
  </Pressable>;
}
