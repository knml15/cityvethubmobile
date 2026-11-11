import FullscreenMap from '../../components/FullscreenMap';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { uploadMediaFile } from '../../api/client';
import {
  getStaffIncidentDetails,
  requirePhase422Backend,
  StaffIncidentDetails,
} from '../../api/phase422';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  getBarangayCoords,
  findNearestBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import { useSurveillanceStore } from '../../store';
import { IncidentReportRow } from '../../store/types/surveillance';

// Contract Section 09.F Barangay Report-Color Rule: 1-2 GREEN; 3-10 YELLOW; 11+ RED; 0 NEUTRAL
const getVolumeColor = (count: number) => {
  if (count >= 11)
    return {
      bg: '#FEE2E2',
      border: '#EF4444',
      text: '#991B1B',
      hex: '#EF4444',
      label: '11+ Reports (High Volume)',
    };
  if (count >= 3)
    return {
      bg: '#FEF3C7',
      border: '#F59E0B',
      text: '#92400E',
      hex: '#F59E0B',
      label: '3–10 Reports (Moderate)',
    };
  if (count >= 1)
    return {
      bg: '#DCFCE7',
      border: '#22C55E',
      text: '#166534',
      hex: '#22C55E',
      label: '1–2 Reports (Low Volume)',
    };
  return {
    bg: '#F1F5F9',
    border: '#CBD5E1',
    text: '#64748B',
    hex: '#94A3B8',
    label: '0 Reports',
  };
};

export default function FieldIncidentScreen() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const {
    staffReports,
    incidentCategories,
    fetchStaffReports,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);

  // Field Officer Report Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] =
    useState<IliganBarangay>('Poblacion');
  const [pinLat, setPinLat] = useState<number>(8.2285);
  const [pinLng, setPinLng] = useState<number>(124.2375);
  const [notes, setNotes] = useState('');
  const [evidencePhoto, setEvidencePhoto] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedReport, setSelectedReport] =
    useState<StaffIncidentDetails | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetchStaffReports();
    fetchIncidentCategories();
  }, [fetchStaffReports, fetchIncidentCategories]);

  useEffect(() => {
    if (incidentCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(incidentCategories[0].name);
    }
  }, [incidentCategories, selectedCategory]);

  // Exclude archived reports from active barangay surveillance counts
  const filteredReports = useMemo(() => {
    return staffReports.filter((r) => {
      if (String(r.status || '').toLowerCase() === 'archived') return false;
      if (categoryFilter === 'ALL') return true;
      return (
        String(r.diseaseType || '').toLowerCase() ===
        categoryFilter.toLowerCase()
      );
    });
  }, [staffReports, categoryFilter]);

  const barangayGroups = useMemo(() => {
    const map = new Map<string, IncidentReportRow[]>();
    filteredReports.forEach((rep) => {
      const brgy = normalizeBarangay(rep.barangay);
      const list = map.get(brgy) || [];
      list.push(rep);
      map.set(brgy, list);
    });

    return Array.from(map.entries())
      .map(([barangay, reports]) => ({
        barangay,
        count: reports.length,
        reports,
        coords: getBarangayCoords(barangay),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const openReportDetails = async (reportId: string) => {
    setReportError('');
    setSelectedReport(null);
    setReportLoading(true);
    try {
      const report = await getStaffIncidentDetails(reportId);
      setSelectedReport(report);
    } catch (e: any) {
      setReportError(e?.message || 'Unable to retrieve report details.');
    } finally {
      setReportLoading(false);
    }
  };

  const pickEvidence = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      if (result.assets[0].fileSize && result.assets[0].fileSize > 5_000_000)
        throw new Error('Maximum 5 MB per photo.');
      setEvidencePhoto(result.assets[0]);
    } catch (e: any) {
      Alert.alert('Image unavailable', e?.message || 'Try another image.');
    }
  };

  const handleSubmitOfficerReport = async () => {
    if (!selectedCategory) {
      Alert.alert('Category Required', 'Select an active incident category.');
      return;
    }

    try {
      await requirePhase422Backend();
      const photoFileId = evidencePhoto
        ? await uploadMediaFile(evidencePhoto)
        : '';
      await reportIncident({
        disease: selectedCategory,
        barangay: selectedBarangay,
        lat: pinLat,
        lng: pinLng,
        description: notes.trim(),
        photoFileId,
      });

      setIsModalVisible(false);
      setNotes('');
      setEvidencePhoto(null);
      await fetchStaffReports();
      Alert.alert(
        'Field Incident Recorded',
        `Incident logged in Brgy. ${selectedBarangay} (${pinLat.toFixed(
          4
        )}, ${pinLng.toFixed(4)}).`
      );
    } catch (error: any) {
      Alert.alert(
        'Submission Failed',
        error?.message || 'Could not submit field incident.'
      );
    }
  };

  const surveillanceMapHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }</style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([8.2280, 124.2452], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var groups = ${JSON.stringify(
            barangayGroups.map((g) => ({
              barangay: g.barangay,
              count: g.count,
              lat: g.coords.latitude,
              lng: g.coords.longitude,
              color: getVolumeColor(g.count).hex,
            }))
          )};

          groups.forEach(function(g) {
            var circle = L.circleMarker([g.lat, g.lng], {
              radius: Math.min(22, 8 + g.count * 1.5),
              fillColor: g.color,
              color: '#FFFFFF',
              weight: 2,
              fillOpacity: 0.85
            }).addTo(map);
            circle.bindPopup('<b>Brgy. ' + g.barangay + '</b><br>Submitted Reports: ' + g.count + '<br><i>Report volume only (not clinical diagnosis)</i>');
          });

          map.on('click', function(e) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                lat: e.latlng.lat,
                lng: e.latlng.lng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Barangay Incident Surveillance
          </Text>
          <Text style={styles.headerSub}>
            Volume Rule: 1–2 Green • 3–10 Yellow • 11+ Red (
            {filteredReports.length} reports)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newReportBtn}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.newReportBtnText}>+ Log Incident</Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          alignItems: 'flex-end',
          paddingHorizontal: 14,
          paddingVertical: 8,
        }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setFullscreen(true)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: '#3478F6',
            borderRadius: 10,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>
            ⛶ Fullscreen surveillance map
          </Text>
        </TouchableOpacity>
      </View>

      <FullscreenMap
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        html={surveillanceMapHTML}
        title="Field surveillance · Iligan City"
        onPick={(latitude, longitude) => {
          setPinLat(latitude);
          setPinLng(longitude);
          setSelectedBarangay(findNearestBarangay(latitude, longitude));
          setFullscreen(false);
          setIsModalVisible(true);
        }}
      />

      {/* Interactive Barangay Volume Map */}
      <View style={styles.mapBox}>
        <WebView
          key={`${categoryFilter}-${filteredReports.length}`}
          originWhitelist={['*']}
          source={{ html: surveillanceMapHTML }}
          style={{ flex: 1 }}
          javaScriptEnabled
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (
                typeof data.lat === 'number' &&
                typeof data.lng === 'number'
              ) {
                const nearest = findNearestBarangay(data.lat, data.lng);
                setPinLat(data.lat);
                setPinLng(data.lng);
                setSelectedBarangay(nearest);
                setIsModalVisible(true);
              }
            } catch {
              // Ignore
            }
          }}
        />
      </View>

      {/* Category Filter */}
      <View style={styles.filterBar}>
        <Picker
          selectedValue={categoryFilter}
          onValueChange={(v) => setCategoryFilter(String(v))}
          style={{ color: colors.text, width: '100%' }}
          dropdownIconColor={colors.text}
        >
          <Picker.Item
            label={`All Incident Categories (${filteredReports.length})`}
            value="ALL"
          />
          {incidentCategories.map((c) => (
            <Picker.Item key={c.$id} label={c.name} value={c.name} />
          ))}
        </Picker>
      </View>

      {/* Grouped Barangay List with Expandable Coordinates */}
      <FlatList
        data={barangayGroups}
        keyExtractor={(item) => item.barangay}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchStaffReports}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Submitted Incident Reports</Text>
            <Text style={styles.emptySub}>
              Tap the map or "+ Log Incident" to submit a field report.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const vol = getVolumeColor(item.count);
          const isExpanded = expandedBarangay === item.barangay;

          return (
            <TouchableOpacity
              style={[styles.groupCard, { borderLeftColor: vol.border }]}
              activeOpacity={0.85}
              onPress={() =>
                setExpandedBarangay(isExpanded ? null : item.barangay)
              }
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.brgyTitle}>Brgy. {item.barangay}</Text>
                  <Text style={styles.volumeLabel}>{vol.label}</Text>
                </View>
                <View style={[styles.countBadge, { backgroundColor: vol.bg }]}>
                  <Text style={[styles.countText, { color: vol.text }]}>
                    {item.count} Report{item.count > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              {isExpanded && (
                <View style={styles.expandedList}>
                  {item.reports.map((rep) => (
                    <TouchableOpacity
                      key={rep.$id}
                      style={styles.reportRow}
                      accessibilityRole="button"
                      onPress={() => openReportDetails(rep.$id)}
                    >
                      <View style={styles.reportTopRow}>
                        <Text style={styles.reportCat}>{rep.diseaseType}</Text>
                        <Text style={styles.reportRole}>
                          Role: {rep.reporterRole || 'owner'}
                        </Text>
                      </View>
                      <Text style={styles.reportCoords}>
                        Coordinates: {Number(rep.latitude).toFixed(5)},{' '}
                        {Number(rep.longitude).toFixed(5)}
                      </Text>
                      {rep.description ? (
                        <Text style={styles.reportDesc}>{rep.description}</Text>
                      ) : null}
                      <Text style={styles.reportDate}>
                        Logged:{' '}
                        {new Date(
                          rep.reportedAt || rep.$createdAt || Date.now()
                        ).toLocaleString()}
                      </Text>
                      <Text
                        style={{
                          color: colors.primary,
                          fontWeight: '700',
                          marginTop: 5,
                        }}
                      >
                        View full report details ›
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Staff-only detail modal */}
      <Modal
        visible={reportLoading || !!selectedReport || !!reportError}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedReport(null);
          setReportError('');
          setReportLoading(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { maxHeight: '85%', borderRadius: 22 }]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Incident report details</Text>
              {reportLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : null}
              {reportError ? (
                <Text style={{ color: '#B91C1C', paddingVertical: 12 }}>
                  {reportError}
                </Text>
              ) : null}
              {selectedReport ? (
                <>
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: '800',
                      fontSize: 18,
                      marginTop: 10,
                    }}
                  >
                    {selectedReport.diseaseType}
                  </Text>
                  <Text style={{ color: colors.secondary, marginVertical: 8 }}>
                    Reported by {selectedReport.reporterName} (
                    {selectedReport.reporterRole || 'staff'})
                  </Text>
                  <Text style={{ color: colors.secondary }}>
                    Barangay: {selectedReport.barangay} · Status:{' '}
                    {selectedReport.status || 'pending'}
                  </Text>
                  <Text style={{ color: colors.secondary, marginTop: 5 }}>
                    Reported:{' '}
                    {new Date(
                      selectedReport.reportedAt || Date.now()
                    ).toLocaleString()}
                  </Text>
                  <Text style={{ color: colors.text, marginVertical: 12 }}>
                    {selectedReport.description ||
                      'No additional notes provided.'}
                  </Text>
                  {selectedReport.photoUrl ? (
                    <Image
                      source={{ uri: selectedReport.photoUrl }}
                      style={{
                        height: 220,
                        borderRadius: 14,
                        marginBottom: 10,
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text
                      style={{ color: colors.secondary, marginBottom: 10 }}
                    >
                      No photo attached.
                    </Text>
                  )}
                  <Text style={{ color: colors.secondary }}>
                    Coordinates: {Number(selectedReport.latitude).toFixed(5)},{' '}
                    {Number(selectedReport.longitude).toFixed(5)}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() =>
                      Linking.openURL(
                        `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
                          String(selectedReport.latitude)
                        )}&mlon=${encodeURIComponent(
                          String(selectedReport.longitude)
                        )}#map=17/${selectedReport.latitude}/${
                          selectedReport.longitude
                        }`
                      ).catch(() =>
                        Alert.alert(
                          'Map unavailable',
                          'Could not open the map application.'
                        )
                      )
                    }
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontWeight: '700',
                        marginVertical: 12,
                      }}
                    >
                      View location in OpenStreetMap ↗
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </ScrollView>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setSelectedReport(null);
                setReportError('');
                setReportLoading(false);
              }}
              style={[styles.cancelBtn, { marginTop: 10 }]}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Submit Field Incident (`submitDisease`) */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 60 }}
            >
              <Text style={styles.modalTitle}>Submit Field Incident</Text>
              <Text style={styles.modalSub}>
                Pinned Coords: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
              </Text>

              <Text style={styles.label}>Active Incident Category *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={selectedCategory}
                  onValueChange={(v) => setSelectedCategory(String(v))}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {incidentCategories.map((c) => (
                    <Picker.Item key={c.$id} label={c.name} value={c.name} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Barangay (Iligan City) *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={selectedBarangay}
                  onValueChange={(val) => {
                    const brgy = val as IliganBarangay;
                    setSelectedBarangay(brgy);
                    const c = getBarangayCoords(brgy);
                    setPinLat(c.latitude);
                    setPinLng(c.longitude);
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {ILIGAN_BARANGAYS.map((brgy) => (
                    <Picker.Item key={brgy} label={brgy} value={brgy} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Field Notes (Optional)</Text>
              <TextInput
                style={[styles.input, { height: 85, textAlignVertical: 'top' }]}
                placeholder="Enter field observations..."
                placeholderTextColor={colors.secondary}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <Text style={styles.label}>
                Evidence photo (optional; max 5 MB)
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={pickEvidence}
                style={styles.pickerBox}
              >
                <Text style={{ color: colors.primary, padding: 12 }}>
                  {evidencePhoto
                    ? `✓ ${evidencePhoto.fileName || 'Photo selected'}`
                    : '+ Attach evidence photo'}
                </Text>
              </TouchableOpacity>
              {evidencePhoto ? (
                <>
                  <Image
                    source={{ uri: evidencePhoto.uri }}
                    style={{ height: 125, borderRadius: 10, marginTop: 8 }}
                  />
                  <TouchableOpacity onPress={() => setEvidencePhoto(null)}>
                    <Text style={{ color: '#B91C1C', marginTop: 4 }}>
                      Remove photo
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSubmitOfficerReport}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  headerSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  newReportBtn: {
    backgroundColor: '#D9534F',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newReportBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  mapBox: { height: 280, width: '100%' },
  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    height: 52,
    justifyContent: 'center',
  },
  listContent: { padding: 14, paddingBottom: 32 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  emptySub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brgyTitle: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  volumeLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: 'bold' },
  expandedList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  reportRow: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  reportCat: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  reportRole: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  reportCoords: { fontSize: 11, color: '#475569', fontWeight: '600' },
  reportDesc: { fontSize: 12, color: '#334155', marginTop: 4 },
  reportDate: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  modalSub: { fontSize: 12, color: '#0284C7', marginBottom: 10 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
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
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#64748B', fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#D9534F',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});