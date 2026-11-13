import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import FullscreenMap from '../../components/FullscreenMap';
import { Picker } from '../../components/BreedPicker';
import { uploadMediaFile } from '../../api/client';
import { requirePhase422Backend } from '../../api/phase422';
import { useAppPalette, useThemedStyles } from '../../theme';
import { useAuthStore, useSurveillanceStore } from '../../store/index';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  findNearestBarangay,
  getBarangayCoords,
  normalizeBarangay,
} from '../../store/types/constants';

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Photo ready';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildLeafletPickerHtml(
  initLat: number,
  initLng: number,
  canvasBackground: string
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${canvasBackground}; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${initLat}, ${initLng}], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var marker = L.marker([${initLat}, ${initLng}], { draggable: true }).addTo(map);
          marker.bindPopup('<b>Incident Location Pin</b><br>Tap map or drag pin to adjust.').openPopup();

          function emitPin(pos) {
            if (!pos) return;
            marker.setLatLng([pos.lat, pos.lng]);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                lat: pos.lat,
                lng: pos.lng
              }));
            }
          }

          map.on('click', function(e) {
            emitPin(e.latlng);
          });

          marker.on('dragend', function() {
            emitPin(marker.getLatLng());
          });

          window.__setIncidentPin = function(nextLat, nextLng) {
            if (typeof nextLat !== 'number' || typeof nextLng !== 'number') return;
            marker.setLatLng([nextLat, nextLng]);
            map.panTo([nextLat, nextLng], { animate: true });
          };
        </script>
      </body>
    </html>
  `;
}

export default function DiseaseMap() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, refreshSession } = useAuthStore();
  const {
    incidentCategories,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const isDark = user?.theme === 'dark';
  const semanticColors = useMemo(
    () => ({
      warningBg: isDark ? '#3B2B12' : '#FEF3C7',
      warningBorder: isDark ? '#5C431C' : '#F59E0B',
      warningText: isDark ? '#FCD34D' : '#92400E',
      warningSubText: isDark ? '#FDE68A' : '#78350F',
      warningBtnBg: isDark ? '#F59E0B' : '#D97706',
      warningBtnText: isDark ? '#0F172A' : '#FFFFFF',
      successBg: isDark ? '#143326' : '#DCFCE7',
      successBorder: isDark ? '#1F4D3A' : '#86EFAC',
      successText: isDark ? '#6EE7B7' : '#166534',
      dangerBg: isDark ? '#3E1C24' : '#FEE2E2',
      dangerBorder: isDark ? '#662A36' : '#FCA5A5',
      dangerText: colors.danger,
      onPrimary: isDark ? '#0F172A' : '#FFFFFF',
    }),
    [isDark, colors.danger]
  );

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
  const [fullscreenSnapshot, setFullscreenSnapshot] = useState(initialCoords);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const webViewRef = useRef<React.ComponentRef<typeof WebView>>(null);
  const initialMountCoordsRef = useRef(initialCoords);
  const hasFocusedOnceRef = useRef(false);

  const isOwnerVerified = user?.accountVerificationStatus === 'verified';
  const isBusySubmitting = isSubmitting || isLoading;

  const loadCategories = useCallback(async () => {
    setIsCategoriesLoading(true);
    setCategoriesError(null);
    try {
      await fetchIncidentCategories();
    } catch (e: any) {
      setCategoriesError(
        e?.message || 'Unable to load incident categories right now.'
      );
    } finally {
      setIsCategoriesLoading(false);
    }
  }, [fetchIncidentCategories]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      refreshSession().catch(() => {});
      fetchIncidentCategories().catch(() => {});
    }, [refreshSession, fetchIncidentCategories])
  );

  useEffect(() => {
    if (incidentCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(incidentCategories[0].name);
    }
  }, [incidentCategories, selectedCategory]);

  const syncEmbeddedPin = useCallback((nextLat: number, nextLng: number) => {
    webViewRef.current?.injectJavaScript(
      `window.__setIncidentPin && window.__setIncidentPin(${nextLat}, ${nextLng}); true;`
    );
  }, []);

  const handleBarangayPickerChange = (brgy: IliganBarangay) => {
    setSelectedBarangay(brgy);
    const coords = getBarangayCoords(brgy);
    setLat(coords.latitude);
    setLng(coords.longitude);
    syncEmbeddedPin(coords.latitude, coords.longitude);
  };

  const handleResetToMyBarangay = () => {
    const homeBrgy = normalizeBarangay(user?.barangay);
    handleBarangayPickerChange(homeBrgy);
  };

  const openFullscreenMap = () => {
    if (isBusySubmitting) return;
    Keyboard.dismiss();
    setFullscreenSnapshot({ latitude: lat, longitude: lng });
    setFullscreen(true);
  };

  const pickIncidentImage = async () => {
    if (isPickingPhoto || isBusySubmitting) return;
    Keyboard.dismiss();
    setIsPickingPhoto(true);
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
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleSubmitIncident = async () => {
    if (isBusySubmitting) return;
    Keyboard.dismiss();
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

    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoized once per theme so pin taps/keystrokes never reload Leaflet tiles
  const embeddedMapHtml = useMemo(
    () =>
      buildLeafletPickerHtml(
        initialMountCoordsRef.current.latitude,
        initialMountCoordsRef.current.longitude,
        colors.surfaceMuted
      ),
    [colors.surfaceMuted]
  );

  // Snapshotted when opening FullscreenMap so picking inside modal stays smooth
  const fullscreenMapHtml = useMemo(
    () =>
      buildLeafletPickerHtml(
        fullscreenSnapshot.latitude,
        fullscreenSnapshot.longitude,
        colors.surfaceMuted
      ),
    [fullscreenSnapshot, colors.surfaceMuted]
  );

  const canSubmit =
    isOwnerVerified && Boolean(selectedCategory) && !isBusySubmitting;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 24}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(120, insets.bottom + 100) },
        ]}
      >
        {!isOwnerVerified ? (
          <View
            style={[
              styles.unverifiedBanner,
              {
                backgroundColor: semanticColors.warningBg,
                borderColor: semanticColors.warningBorder,
              },
            ]}
          >
            <View style={styles.unverifiedTitleRow}>
              <Text style={{ fontSize: 16 }}>🔒</Text>
              <Text
                style={[
                  styles.unverifiedTitle,
                  { color: semanticColors.warningText },
                ]}
              >
                CVO Account Verification Required
              </Text>
            </View>
            <Text
              style={[
                styles.unverifiedText,
                { color: semanticColors.warningSubText },
              ]}
            >
              To prevent false alarms, only CVO-Verified Pet Owners can submit
              incident reports. Please upload your Government ID in your
              profile first.
            </Text>
            <TouchableOpacity
              style={[
                styles.verifyLinkBtn,
                { backgroundColor: semanticColors.warningBtnBg },
              ]}
              onPress={() =>
                navigation.navigate('UserProfile', { tab: 'verification' })
              }
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.verifyLinkBtnText,
                  { color: semanticColors.warningBtnText },
                ]}
              >
                Go to My Profile → ID Verify
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.verifiedBanner,
              {
                backgroundColor: semanticColors.successBg,
                borderColor: semanticColors.successBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.verifiedBannerIcon,
                { color: semanticColors.successText },
              ]}
            >
              ✓
            </Text>
            <Text
              style={[
                styles.verifiedBannerText,
                { color: semanticColors.successText },
              ]}
            >
              Verified Pet Owner — Tap anywhere on the map or drag the pin to
              mark the incident location.
            </Text>
          </View>
        )}

        <FullscreenMap
          visible={fullscreen}
          onClose={() => setFullscreen(false)}
          html={fullscreenMapHtml}
          title="Pin Incident Location"
          onPick={(latitude, longitude) => {
            setLat(latitude);
            setLng(longitude);
            setSelectedBarangay(findNearestBarangay(latitude, longitude));
            syncEmbeddedPin(latitude, longitude);
          }}
        />

        <View style={styles.mapCard}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: embeddedMapHtml }}
            style={styles.map}
            javaScriptEnabled
            nestedScrollEnabled
            onLoadEnd={() => setIsMapReady(true)}
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
          {!isMapReady && (
            <View
              style={[
                styles.mapLoadingOverlay,
                { backgroundColor: colors.surfaceMuted },
              ]}
              pointerEvents="none"
            >
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.mapLoadingText, { color: colors.secondary }]}>
                Loading map tiles...
              </Text>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={openFullscreenMap}
            disabled={isBusySubmitting}
            style={[
              styles.floatingFullscreenBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              isBusySubmitting && styles.dimmedControl,
            ]}
          >
            <Text style={[styles.fullscreenBtnText, { color: colors.primary }]}>
              ⛶ Fullscreen
            </Text>
          </TouchableOpacity>
          <View style={styles.coordsBar}>
            <View style={styles.coordsBadge}>
              <Text style={styles.coordsBadgeText} numberOfLines={1}>
                📍 {selectedBarangay}
              </Text>
            </View>
            <Text style={styles.coordsText} selectable>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Submit Suspected Incident Report</Text>
          <Text style={styles.formSubtitle}>
            Reports are routed privately to CVO Field Officers and
            Administrators.
          </Text>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Incident Category *</Text>
          </View>
          {categoriesError && incidentCategories.length === 0 ? (
            <View
              style={[
                styles.categoryErrorBox,
                {
                  backgroundColor: semanticColors.dangerBg,
                  borderColor: semanticColors.dangerBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryErrorText,
                  { color: semanticColors.dangerText },
                ]}
              >
                {categoriesError}
              </Text>
              <TouchableOpacity
                onPress={loadCategories}
                style={[
                  styles.retryCatBtn,
                  {
                    borderColor: semanticColors.dangerBorder,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.retryCatBtnText,
                    { color: semanticColors.dangerText },
                  ]}
                >
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pickerBox}>
              {isCategoriesLoading && incidentCategories.length === 0 ? (
                <View style={styles.pickerLoadingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text
                    style={[
                      styles.pickerLoadingText,
                      { color: colors.secondary },
                    ]}
                  >
                    Loading incident categories...
                  </Text>
                </View>
              ) : incidentCategories.length === 0 ? (
                <View style={styles.pickerLoadingRow}>
                  <Text
                    style={[
                      styles.pickerLoadingText,
                      { color: colors.secondary },
                    ]}
                  >
                    No active incident categories available.
                  </Text>
                </View>
              ) : (
                <Picker
                  title="Select Incident Category"
                  selectedValue={selectedCategory}
                  onValueChange={(v) => setSelectedCategory(String(v))}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {incidentCategories.map((cat) => (
                    <Picker.Item
                      key={cat.$id}
                      label={cat.name}
                      value={cat.name}
                    />
                  ))}
                </Picker>
              )}
            </View>
          )}

          <View style={styles.labelRow}>
            <Text style={styles.label}>Incident Barangay *</Text>
            <View style={styles.brgyActionGroup}>
              <TouchableOpacity
                onPress={handleResetToMyBarangay}
                disabled={isBusySubmitting}
                style={[
                  styles.resetPinChip,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.resetPinText, { color: colors.secondary }]}
                >
                  ↺ Reset Pin
                </Text>
              </TouchableOpacity>
              <View
                style={[
                  styles.autoFilledChip,
                  { backgroundColor: colors.primaryMuted },
                ]}
              >
                <Text style={[styles.autoFilledText, { color: colors.primary }]}>
                  📍 Synced
                </Text>
              </View>
            </View>
          </View>
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

          <View style={styles.labelRow}>
            <Text style={styles.label}>Description & Landmarks (Optional)</Text>
          </View>
          <TextInput
            style={styles.textArea}
            placeholder="Describe animal appearance, observed symptoms (e.g. aggression, foaming), or landmarks near the pin..."
            placeholderTextColor={colors.secondary}
            maxLength={1000}
            multiline
            editable={!isBusySubmitting}
            returnKeyType="done"
            value={description}
            onChangeText={setDescription}
          />
          <Text style={styles.charCount}>{description.length} / 1000</Text>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Incident Evidence Photo (Optional)</Text>
            <Text style={styles.labelHint}>Max 5 MB • Private</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={pickIncidentImage}
            disabled={isPickingPhoto || isBusySubmitting}
            style={[
              styles.photoUploadBtn,
              (isPickingPhoto || isBusySubmitting) && styles.dimmedControl,
            ]}
          >
            <Text style={{ fontSize: 18, marginRight: 8 }}>📷</Text>
            <Text style={[styles.photoUploadText, { color: colors.primary }]}>
              {isPickingPhoto
                ? 'Opening Gallery...'
                : incidentPhoto
                ? 'Change Evidence Photo'
                : 'Choose Incident Evidence Photo'}
            </Text>
          </TouchableOpacity>

          {incidentPhoto ? (
            <View style={styles.photoPreviewCard}>
              <Image
                source={{ uri: incidentPhoto.uri }}
                style={styles.photoPreviewImg}
                resizeMode="cover"
              />
              <View style={styles.photoPreviewMeta}>
                <Text style={styles.photoPreviewName} numberOfLines={1}>
                  {incidentPhoto.fileName || 'evidence_photo.jpg'}
                </Text>
                <Text style={[styles.photoSizeText, { color: colors.secondary }]}>
                  {formatFileSize(incidentPhoto.fileSize)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.removePhotoBtn,
                    {
                      backgroundColor: semanticColors.dangerBg,
                      borderColor: semanticColors.dangerBorder,
                    },
                    isBusySubmitting && styles.dimmedControl,
                  ]}
                  disabled={isBusySubmitting}
                  onPress={() => setIncidentPhoto(null)}
                >
                  <Text
                    style={[
                      styles.removePhotoText,
                      { color: semanticColors.dangerText },
                    ]}
                  >
                    ✕ Remove Photo
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              !canSubmit && {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                borderWidth: 1,
                opacity: 0.7,
              },
            ]}
            onPress={handleSubmitIncident}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {isBusySubmitting ? (
              <View style={styles.submitBusyRow}>
                <ActivityIndicator color={colors.text} size="small" />
                <Text style={[styles.submitBtnText, { color: colors.text }]}>
                  Submitting Report...
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.submitBtnText,
                  !canSubmit && { color: colors.secondary },
                ]}
              >
                {!isOwnerVerified
                  ? 'Account Verification Required to Submit'
                  : !selectedCategory
                  ? 'Select Incident Category to Submit'
                  : 'Submit Incident Report to CVO'}
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  unverifiedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  unverifiedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
    flex: 1,
  },
  unverifiedText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 4,
  },
  verifyLinkBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  verifyLinkBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  verifiedBanner: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedBannerIcon: {
    color: '#16A34A',
    fontSize: 16,
    fontWeight: '900',
  },
  verifiedBannerText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },
  mapCard: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  map: { flex: 1 },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 42,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapLoadingText: { fontSize: 12, fontWeight: '600' },
  floatingFullscreenBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fullscreenBtnText: { color: '#3478F6', fontWeight: '800', fontSize: 12 },
  coordsBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  coordsBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 1,
  },
  coordsBadgeText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  coordsText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  formSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  labelHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  brgyActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resetPinChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  resetPinText: { fontSize: 10, fontWeight: '700' },
  autoFilledChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  autoFilledText: {
    fontSize: 10,
    color: '#3478F6',
    fontWeight: '700',
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  pickerLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  pickerLoadingText: { fontSize: 12, fontWeight: '600' },
  categoryErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryErrorText: { flex: 1, fontSize: 12, fontWeight: '600' },
  retryCatBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryCatBtnText: { fontSize: 12, fontWeight: '700' },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    height: 95,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#1E293B',
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  photoUploadBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  photoUploadText: {
    color: '#3478F6',
    fontWeight: '700',
    fontSize: 13,
  },
  photoPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 10,
    gap: 12,
  },
  photoPreviewImg: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  photoPreviewMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  photoPreviewName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  photoSizeText: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  removePhotoBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
  },
  submitBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  dimmedControl: { opacity: 0.55 },
});
