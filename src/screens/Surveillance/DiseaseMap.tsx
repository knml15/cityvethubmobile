import FullscreenMap from '../../components/FullscreenMap';
import * as ImagePicker from 'expo-image-picker';
import { uploadMediaFile } from '../../api/client';
import { requirePhase422Backend } from '../../api/phase422';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useState, useEffect } from 'react';
import { Picker } from '@react-native-picker/picker';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  getBarangayCoords,
  findNearestBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { useSurveillanceStore, useAuthStore } from '../../store/index';

export default function DiseaseMap() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const {
    incidentCategories,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const initialBrgy = normalizeBarangay(user?.barangay);
  const initialCoords = getBarangayCoords(initialBrgy);

  const [selectedBarangay, setSelectedBarangay] =
    useState<IliganBarangay>(initialBrgy);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lat, setLat] = useState<number>(initialCoords.latitude);
  const [lng, setLng] = useState<number>(initialCoords.longitude);
  const [description, setDescription] = useState('');
  const [incidentPhoto, setIncidentPhoto] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const isOwnerVerified = user?.accountVerificationStatus === 'verified';

  useEffect(() => {
    fetchIncidentCategories();
  }, [fetchIncidentCategories]);

  useEffect(() => {
    if (incidentCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(incidentCategories[0].name);
    }
  }, [incidentCategories, selectedCategory]);

  const handleBarangayPickerChange = (brgy: IliganBarangay) => {
    setSelectedBarangay(brgy);
    const coords = getBarangayCoords(brgy);
    setLat(coords.latitude);
    setLng(coords.longitude);
  };

  const pickIncidentImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      if (result.assets[0].fileSize && result.assets[0].fileSize > 5_000_000) {
        throw new Error('Image must be 5 MB or smaller.');
      }
      setIncidentPhoto(result.assets[0]);
    } catch (e: any) {
      Alert.alert(
        'Cannot attach photo',
        e?.message || 'Select a JPG, PNG, or WEBP image.'
      );
    }
  };

  const handleSubmitIncident = async () => {
    if (!isOwnerVerified) {
      Alert.alert(
        'CVO Account Verification Required',
        'Only CVO-Verified Pet Owners can submit incident reports. Please upload your Government ID in Profile > ID Verify first.'
      );
      return;
    }

    if (!selectedCategory) {
      Alert.alert(
        'Category Required',
        'Please select an active incident category.'
      );
      return;
    }

    try {
      await requirePhase422Backend();
      const photoFileId = incidentPhoto
        ? await uploadMediaFile(incidentPhoto)
        : '';
      await reportIncident({
        disease: selectedCategory,
        barangay: selectedBarangay,
        lat,
        lng,
        description: description.trim(),
        photoFileId,
      });

      setDescription('');
      setIncidentPhoto(null);
      Alert.alert(
        'Incident Report Submitted (Pending)',
        `Your report (${selectedCategory}) at Brgy. ${selectedBarangay} (${lat.toFixed(
          4
        )}, ${lng.toFixed(4)}) has been privately logged for CVO review.`
      );
    } catch (error: any) {
      Alert.alert(
        'Submission Blocked',
        error?.message || 'Could not submit incident report.'
      );
    }
  };

  const leafletPickerHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${lat}, ${lng}], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var marker = L.marker([${lat}, ${lng}]).addTo(map);
          marker.bindPopup('<b>Selected Incident Pin</b><br>Tap anywhere on map to move pin.').openPopup();

          map.on('click', function(e) {
            var clickedLat = e.latlng.lat;
            var clickedLng = e.latlng.lng;
            marker.setLatLng([clickedLat, clickedLng]);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                lat: clickedLat,
                lng: clickedLng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 24}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {!isOwnerVerified ? (
          <View style={styles.unverifiedBanner}>
            <Text style={styles.unverifiedTitle}>
              🔒 CVO Account Verification Required
            </Text>
            <Text style={styles.unverifiedText}>
              To prevent false alarms, only CVO-Verified Pet Owners (with an
              approved Government ID and at least 1 pet) can submit incident
              reports. Note: A verified pet alone does not verify your account.
            </Text>
            <TouchableOpacity
              style={styles.verifyLinkBtn}
              onPress={() => navigation.navigate('UserProfile')}
            >
              <Text style={styles.verifyLinkBtnText}>
                Go to My Profile &gt; ID Verify
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.verifiedBanner}>
            <Text style={styles.verifiedBannerText}>
              ✓ Verified Pet Owner — Tap the Iligan City map below to drop a pin
              at the incident location.
            </Text>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setFullscreen(true)}
          style={styles.fullscreenBtn}
        >
          <Text style={styles.fullscreenBtnText}>
            ⛶ Open Fullscreen Map to Pin Location
          </Text>
        </TouchableOpacity>

        <FullscreenMap
          visible={fullscreen}
          onClose={() => setFullscreen(false)}
          html={leafletPickerHTML}
          title="Pin Incident Location"
          onPick={(latitude, longitude) => {
            setLat(latitude);
            setLng(longitude);
            setSelectedBarangay(findNearestBarangay(latitude, longitude));
          }}
        />

        <View style={styles.mapCard}>
          <WebView
            originWhitelist={['*']}
            source={{ html: leafletPickerHTML }}
            style={styles.map}
            javaScriptEnabled
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (
                  typeof data.lat === 'number' &&
                  typeof data.lng === 'number'
                ) {
                  setLat(data.lat);
                  setLng(data.lng);
                  const nearest = findNearestBarangay(data.lat, data.lng);
                  setSelectedBarangay(nearest);
                }
              } catch {
                // Ignore malformed message
              }
            }}
          />
          <View style={styles.coordsBar}>
            <Text style={styles.coordsText}>
              📍 Pin Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)} • Brgy.{' '}
              {selectedBarangay}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Submit Suspected Incident Report</Text>
          <Text style={styles.formSubtitle}>
            Reports are routed privately to CVO Field Officers and
            Administrators.
          </Text>

          <Text style={styles.label}>
            Incident Category (Admin-Defined Active Categories) *
          </Text>
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={selectedCategory}
              onValueChange={(v) => setSelectedCategory(String(v))}
              style={{ color: colors.text, width: '100%' }}
              dropdownIconColor={colors.text}
            >
              {incidentCategories.length === 0 ? (
                <Picker.Item
                  label="Loading active incident categories..."
                  value=""
                />
              ) : (
                incidentCategories.map((cat) => (
                  <Picker.Item
                    key={cat.$id}
                    label={cat.name}
                    value={cat.name}
                  />
                ))
              )}
            </Picker>
          </View>

          <Text style={styles.label}>
            Iligan City Barangay (Auto-filled from map tap, adjustable) *
          </Text>
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={selectedBarangay}
              onValueChange={(v) =>
                handleBarangayPickerChange(v as IliganBarangay)
              }
              style={{ color: colors.text, width: '100%' }}
              dropdownIconColor={colors.text}
            >
              {ILIGAN_BARANGAYS.map((b) => (
                <Picker.Item key={b} label={b} value={b} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>
            Description / Landmark / Animal Symptoms (Optional, max 1000 chars)
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe the animal, symptoms, or landmark near the pinned coordinates..."
            placeholderTextColor={colors.secondary}
            maxLength={1000}
            multiline
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.label}>
            Incident Photo (Optional, max 5 MB, private to CVO staff)
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={pickIncidentImage}
            style={[styles.pickerBox, { paddingHorizontal: 12 }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              {incidentPhoto
                ? `✓ ${incidentPhoto.fileName || 'Photo selected'}`
                : '📷 Choose Incident Evidence Photo'}
            </Text>
          </TouchableOpacity>

          {incidentPhoto ? (
            <View style={{ marginTop: 8 }}>
              <Image
                source={{ uri: incidentPhoto.uri }}
                style={{ height: 140, borderRadius: 10, marginBottom: 6 }}
                resizeMode="cover"
              />
              <TouchableOpacity onPress={() => setIncidentPhoto(null)}>
                <Text style={{ color: '#B91C1C', fontWeight: '700' }}>
                  Remove selected photo
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              !isOwnerVerified && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmitIncident}
            disabled={!isOwnerVerified || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isOwnerVerified
                  ? 'Submit Incident Report to CVO'
                  : 'Account Verification Required to Submit'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 140 },
  unverifiedBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  unverifiedTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 4,
  },
  unverifiedText: { fontSize: 12, color: '#78350F', lineHeight: 17 },
  verifyLinkBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  verifyLinkBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  verifiedBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  verifiedBannerText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
  fullscreenBtn: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#E0F2FE',
    borderRadius: 10,
  },
  fullscreenBtnText: { color: '#0369A1', fontWeight: '800', fontSize: 12 },
  mapCard: {
    height: 290,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  map: { flex: 1 },
  coordsBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coordsText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  formSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    height: 95,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#1E293B',
  },
  submitBtn: {
    backgroundColor: '#D9534F',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnDisabled: { backgroundColor: '#94A3B8' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});