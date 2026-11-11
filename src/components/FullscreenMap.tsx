import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAppPalette } from '../theme';

/** Leaflet WebView surface displayed above the tab bar and Android navigation inset. */
export default function FullscreenMap({ visible, onClose, html, onPick, title = 'Incident map' }: {
  visible: boolean; onClose: () => void; html: string;
  onPick: (latitude: number, longitude: number) => void; title?: string;
}) {
  const colors = useAppPalette();
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView edges={['top','bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{title}</Text>
          <Text style={{ color: colors.secondary, fontSize: 12 }}>Tap a location to select coordinates</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}
          style={{ backgroundColor: colors.primaryMuted, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>Done ✕</Text>
        </TouchableOpacity>
      </View>
      <WebView style={{ flex: 1 }} source={{ html }} originWhitelist={['*']} javaScriptEnabled
        onMessage={(event) => {
          try { const value = JSON.parse(event.nativeEvent.data);
            if (Number.isFinite(value.lat) && Number.isFinite(value.lng)) onPick(value.lat, value.lng);
          } catch { /* Malformed map messages are ignored */ }
        }}/>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }}>
        <Text style={{ color: colors.secondary, fontSize: 12 }}>Map data © OpenStreetMap contributors. Coordinates can be refined before submitting.</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}
