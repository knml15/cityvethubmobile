import FullscreenMap from '../../components/FullscreenMap';
import NotificationBell from '../../components/NotificationBell';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { uploadMediaFile } from '../../api/client';
import {
  getStaffIncidentDetails,
  requirePhase422Backend,
  StaffIncidentDetails,
} from '../../api/phase422';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, {
  ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveSync } from '../../utils/useLiveSync';
import { Picker } from '../../components/BreedPicker';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  findNearestBarangay,
  getBarangayCoords,
  ILIGAN_BARANGAYS,
  IliganBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import { useAuthStore, useSurveillanceStore } from '../../store';
import { IncidentReportRow } from '../../store/types/surveillance';

type VolumeFilter = 'ALL' | 'HIGH' | 'MOD' | 'LOW';
type SortMode = 'count' | 'latest' | 'az';
type PinSource = 'barangay' | 'map';
type EvidenceDraft = {
  asset: ImagePicker.ImagePickerAsset;
  uploadedFileId?: string;
};

// Contract Section 09.F Barangay Report-Color Rule: 1-2 GREEN; 3-10 YELLOW; 11+ RED; 0 NEUTRAL
const getVolumeColor = (count: number, isDark = false) => {
  if (count >= 11)
    return {
      tier: 'HIGH' as const,
      bg: isDark ? '#3F1D24' : '#FEE2E2',
      border: '#EF4444',
      text: isDark ? '#FCA5A5' : '#991B1B',
      hex: '#EF4444',
      label: '11+ Reports (High Volume)',
    };
  if (count >= 3)
    return {
      tier: 'MOD' as const,
      bg: isDark ? '#33250B' : '#FEF3C7',
      border: '#F59E0B',
      text: isDark ? '#FCD34D' : '#92400E',
      hex: '#F59E0B',
      label: '3–10 Reports (Moderate)',
    };
  if (count >= 1)
    return {
      tier: 'LOW' as const,
      bg: isDark ? '#143322' : '#DCFCE7',
      border: '#22C55E',
      text: isDark ? '#4ADE80' : '#166534',
      hex: '#22C55E',
      label: '1–2 Reports (Low Volume)',
    };
  return {
    tier: 'ZERO' as const,
    bg: isDark ? '#25364B' : '#F1F5F9',
    border: isDark ? '#35465D' : '#CBD5E1',
    text: isDark ? '#ABBBD0' : '#64748B',
    hex: '#94A3B8',
    label: '0 Reports',
  };
};

function buildLeafletHtml(initialMarkersJson: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
          .vol-count-label {
            color: #FFFFFF;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            text-shadow: 0 1px 2px rgba(0,0,0,0.65);
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([8.2280, 124.2452], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);
          var markerLayer = L.layerGroup().addTo(map);

          window.__updateSurveillanceMarkers = function(groups) {
            markerLayer.clearLayers();
            (groups || []).forEach(function(g) {
              var circle = L.circleMarker([g.lat, g.lng], {
                radius: Math.min(22, 10 + g.count * 1.4),
                fillColor: g.color,
                color: '#FFFFFF',
                weight: 2,
                fillOpacity: 0.88
              }).addTo(markerLayer);
              circle.bindPopup('<b>Brgy. ' + g.barangay + '</b><br>Submitted Reports: ' + g.count + '<br><i>Report volume only (not clinical diagnosis)</i>');

              L.marker([g.lat, g.lng], {
                interactive: false,
                icon: L.divIcon({
                  className: 'vol-count-label',
                  html: String(g.count),
                  iconSize: [28, 16],
                  iconAnchor: [14, 8]
                })
              }).addTo(markerLayer);
            });
          };

          window.__focusSurveillanceCoords = function(lat, lng, zoom) {
            if (typeof lat === 'number' && typeof lng === 'number') {
              map.setView([lat, lng], zoom || 14);
            }
          };

          window.__updateSurveillanceMarkers(${initialMarkersJson});

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
}

export default function FieldIncidentScreen() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const isDark = useAuthStore((s) => s.user?.theme === 'dark');
  const insets = useSafeAreaInsets();
  const {
    staffReports,
    incidentCategories,
    fetchStaffReports,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const semantic = useMemo(
    () => ({
      dangerBg: isDark ? '#3F1D24' : '#FEE2E2',
      dangerBorder: isDark ? '#7F1D1D' : '#FCA5A5',
      headerBg: isDark ? '#172438' : '#1E293B',
      headerSub: isDark ? '#ABBBD0' : '#94A3B8',
      osmBg: isDark ? '#1B2E4B' : '#EFF6FF',
      osmBorder: isDark ? '#3B66A8' : '#93C5FD',
      osmText: isDark ? '#93C5FD' : '#1D4ED8',
    }),
    [isDark]
  );

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [volumeFilter, setVolumeFilter] = useState<VolumeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('count');
  const [barangaySearch, setBarangaySearch] = useState('');
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);
  const [isMapCollapsed, setIsMapCollapsed] = useState(false);

  // Field Officer Report Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] =
    useState<IliganBarangay>('Poblacion');
  const [pinLat, setPinLat] = useState<number>(8.2285);
  const [pinLng, setPinLng] = useState<number>(124.2375);
  const [pinSource, setPinSource] = useState<PinSource>('barangay');
  const [notes, setNotes] = useState('');
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadingCategories, setReloadingCategories] = useState(false);

  // Detail modal & fullscreen inspection state
  const [selectedReport, setSelectedReport] =
    useState<StaffIncidentDetails | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [detailPhotoLoading, setDetailPhotoLoading] = useState(false);
  const [detailPhotoFailed, setDetailPhotoFailed] = useState(false);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const reopenSubmitAfterMapRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const lastDetailReqRef = useRef(0);
  const lastDetailIdRef = useRef<string | null>(null);
  const inlineWebViewRef = useRef<ComponentRef<typeof WebView>>(null);

  useFocusEffect(
    useCallback(() => {
      const silent = hasLoadedOnceRef.current;
      fetchStaffReports(silent).finally(() => {
        hasLoadedOnceRef.current = true;
      });
      fetchIncidentCategories();
    }, [fetchStaffReports, fetchIncidentCategories])
  );

  useLiveSync(
    () => {
      fetchStaffReports(true);
      fetchIncidentCategories();
    },
    {
      enabled:
        !isModalVisible &&
        !selectedReport &&
        !fullscreen &&
        !previewPhotoUri,
    }
  );

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

  const allBarangayGroups = useMemo(() => {
    const map = new Map<string, IncidentReportRow[]>();
    filteredReports.forEach((rep) => {
      const brgy = normalizeBarangay(rep.barangay);
      const list = map.get(brgy) || [];
      list.push(rep);
      map.set(brgy, list);
    });

    return Array.from(map.entries()).map(([barangay, reports]) => {
      const latestMs = reports.reduce((max, r) => {
        const ts = new Date(r.reportedAt || r.$createdAt || 0).getTime() || 0;
        return ts > max ? ts : max;
      }, 0);
      return {
        barangay,
        count: reports.length,
        latestMs,
        reports,
        coords: getBarangayCoords(barangay),
      };
    });
  }, [filteredReports]);

  const volumeCounts = useMemo(() => {
    let high = 0;
    let mod = 0;
    let low = 0;
    for (const g of allBarangayGroups) {
      if (g.count >= 11) high++;
      else if (g.count >= 3) mod++;
      else if (g.count >= 1) low++;
    }
    return { high, mod, low };
  }, [allBarangayGroups]);

  const displayedBarangayGroups = useMemo(() => {
    const q = barangaySearch.trim().toLowerCase();
    const list = allBarangayGroups.filter((g) => {
      if (q && !g.barangay.toLowerCase().includes(q)) return false;
      if (volumeFilter === 'HIGH') return g.count >= 11;
      if (volumeFilter === 'MOD') return g.count >= 3 && g.count <= 10;
      if (volumeFilter === 'LOW') return g.count >= 1 && g.count <= 2;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'latest') return b.latestMs - a.latestMs;
      if (sortMode === 'az') return a.barangay.localeCompare(b.barangay);
      return b.count - a.count;
    });
  }, [allBarangayGroups, barangaySearch, volumeFilter, sortMode]);

  const mapMarkersPayload = useMemo(
    () =>
      displayedBarangayGroups.map((g) => ({
        barangay: g.barangay,
        count: g.count,
        lat: g.coords.latitude,
        lng: g.coords.longitude,
        color: getVolumeColor(g.count, isDark).hex,
      })),
    [displayedBarangayGroups, isDark]
  );

  // Keep inline WebView shell static so pan/zoom never resets on live sync or filter changes
  const staticInlineMapHtml = useMemo(
    () => buildLeafletHtml(JSON.stringify(mapMarkersPayload)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fullscreenMapHtml = useMemo(
    () => buildLeafletHtml(JSON.stringify(mapMarkersPayload)),
    [mapMarkersPayload]
  );

  const pushMarkersToInlineMap = useCallback(() => {
    if (isMapCollapsed || !inlineWebViewRef.current) return;
    const js = `window.__updateSurveillanceMarkers && window.__updateSurveillanceMarkers(${JSON.stringify(
      mapMarkersPayload
    )}); true;`;
    inlineWebViewRef.current.injectJavaScript(js);
  }, [isMapCollapsed, mapMarkersPayload]);

  useEffect(() => {
    pushMarkersToInlineMap();
  }, [pushMarkersToInlineMap]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchStaffReports(false), fetchIncidentCategories()]);
  }, [fetchStaffReports, fetchIncidentCategories]);

  const handleRetryCategories = async () => {
    if (reloadingCategories) return;
    setReloadingCategories(true);
    try {
      await fetchIncidentCategories();
    } finally {
      setReloadingCategories(false);
    }
  };

  const openReportDetails = async (reportId: string) => {
    const reqId = ++lastDetailReqRef.current;
    lastDetailIdRef.current = reportId;
    setReportError('');
    setSelectedReport(null);
    setDetailPhotoLoading(false);
    setDetailPhotoFailed(false);
    setReportLoading(true);
    try {
      const report = await getStaffIncidentDetails(reportId);
      if (lastDetailReqRef.current !== reqId) return;
      setSelectedReport(report);
      if (report.photoUrl) {
        setDetailPhotoLoading(true);
      }
    } catch (e: any) {
      if (lastDetailReqRef.current !== reqId) return;
      setReportError(e?.message || 'Unable to retrieve report details.');
    } finally {
      if (lastDetailReqRef.current === reqId) {
        setReportLoading(false);
      }
    }
  };

  const closeDetailModal = () => {
    lastDetailReqRef.current++;
    setSelectedReport(null);
    setReportError('');
    setReportLoading(false);
    setDetailPhotoLoading(false);
    setDetailPhotoFailed(false);
  };

  const openSubmitForBarangay = (brgy: IliganBarangay) => {
    const coords = getBarangayCoords(brgy);
    setSelectedBarangay(brgy);
    setPinLat(coords.latitude);
    setPinLng(coords.longitude);
    setPinSource('barangay');
    setIsModalVisible(true);
  };

  const closeSubmitModal = () => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    setIsModalVisible(false);
    setNotes('');
    setEvidenceDraft(null);
  };

  const pickEvidence = async () => {
    if (isSubmitting) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      if (result.assets[0].fileSize && result.assets[0].fileSize > 5_000_000)
        throw new Error('Maximum 5 MB per photo.');
      setEvidenceDraft({ asset: result.assets[0] });
    } catch (e: any) {
      Alert.alert('Image unavailable', e?.message || 'Try another image.');
    }
  };

  const handleSubmitOfficerReport = async () => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    if (!selectedCategory) {
      Alert.alert('Category Required', 'Select an active incident category.');
      return;
    }

    const loggedBarangay = selectedBarangay;
    const loggedLat = pinLat;
    const loggedLng = pinLng;

    setIsSubmitting(true);
    let currentDraft = evidenceDraft;
    try {
      await requirePhase422Backend();
      let photoFileId = currentDraft?.uploadedFileId || '';
      if (currentDraft && !photoFileId) {
        photoFileId = await uploadMediaFile(currentDraft.asset);
        currentDraft = { ...currentDraft, uploadedFileId: photoFileId };
        setEvidenceDraft(currentDraft);
      }

      await reportIncident({
        disease: selectedCategory,
        barangay: loggedBarangay,
        lat: loggedLat,
        lng: loggedLng,
        description: notes.trim(),
        photoFileId,
      });

      setIsModalVisible(false);
      setNotes('');
      setEvidenceDraft(null);
      setExpandedBarangay(loggedBarangay);
      if (inlineWebViewRef.current && !isMapCollapsed) {
        inlineWebViewRef.current.injectJavaScript(
          `window.__focusSurveillanceCoords && window.__focusSurveillanceCoords(${loggedLat}, ${loggedLng}, 14); true;`
        );
      }
      Alert.alert(
        'Field Incident Recorded',
        `Incident logged in Brgy. ${loggedBarangay} (${loggedLat.toFixed(
          4
        )}, ${loggedLng.toFixed(4)}).`
      );
      fetchStaffReports(true);
    } catch (error: any) {
      Alert.alert(
        'Submission Failed',
        error?.message || 'Could not submit field incident.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasActiveFilters =
    categoryFilter !== 'ALL' ||
    volumeFilter !== 'ALL' ||
    barangaySearch.trim().length > 0;

  const resetAllFilters = () => {
    setCategoryFilter('ALL');
    setVolumeFilter('ALL');
    setBarangaySearch('');
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: colors.background },
      ]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: semantic.headerBg },
        ]}
      >
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Barangay Incident Surveillance
          </Text>
          <Text style={[styles.headerSub, { color: semantic.headerSub }]}>
            {filteredReports.length} active report
            {filteredReports.length === 1 ? '' : 's'} across{' '}
            {allBarangayGroups.length} barangay
            {allBarangayGroups.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={[
              styles.newReportBtn,
              { backgroundColor: colors.primary },
            ]}
            onPress={() => openSubmitForBarangay(selectedBarangay)}
          >
            <Text style={styles.newReportBtnText}>+ Log Incident</Text>
          </TouchableOpacity>
          <NotificationBell />
        </View>
      </View>

      <FullscreenMap
        visible={fullscreen}
        onClose={() => {
          setFullscreen(false);
          if (reopenSubmitAfterMapRef.current) {
            reopenSubmitAfterMapRef.current = false;
            setIsModalVisible(true);
          }
        }}
        html={fullscreenMapHtml}
        title="Field surveillance · Iligan City"
        onPick={(latitude, longitude) => {
          reopenSubmitAfterMapRef.current = false;
          setPinLat(latitude);
          setPinLng(longitude);
          setPinSource('map');
          setSelectedBarangay(findNearestBarangay(latitude, longitude));
          setFullscreen(false);
          setIsModalVisible(true);
        }}
      />

      {/* Collapsible Interactive Barangay Volume Map */}
      {isMapCollapsed ? (
        <View
          style={[
            styles.collapsedMapBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.collapsedMapBtn,
              { backgroundColor: colors.primaryMuted },
            ]}
            onPress={() => setIsMapCollapsed(false)}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold' }}>
              🗺️ Show Surveillance Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.collapsedMapBtn,
              { backgroundColor: colors.surfaceMuted },
            ]}
            onPress={() => setFullscreen(true)}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: 'bold' }}>
              ⛶ Fullscreen
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapBox}>
          <WebView
            ref={inlineWebViewRef}
            originWhitelist={['*']}
            source={{ html: staticInlineMapHtml }}
            style={{ flex: 1 }}
            javaScriptEnabled
            onLoadEnd={pushMarkersToInlineMap}
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
                  setPinSource('map');
                  setSelectedBarangay(nearest);
                  setIsModalVisible(true);
                }
              } catch {
                // Ignore malformed WebView bridge payloads
              }
            }}
          />
          <View style={styles.mapOverlayControls}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setIsMapCollapsed(true)}
              style={styles.mapOverlayBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.mapFullscreenBtnText}>▲ Hide Map</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setFullscreen(true)}
              style={styles.mapOverlayBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.mapFullscreenBtnText}>⛶ Fullscreen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Volume Legend & Quick Filter Strip (1-2 Green, 3-10 Yellow, 11+ Red) */}
      <View
        style={[
          styles.legendBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {(
          [
            {
              key: 'HIGH' as const,
              label: `11+ (${volumeCounts.high})`,
              vol: getVolumeColor(11, isDark),
            },
            {
              key: 'MOD' as const,
              label: `3–10 (${volumeCounts.mod})`,
              vol: getVolumeColor(3, isDark),
            },
            {
              key: 'LOW' as const,
              label: `1–2 (${volumeCounts.low})`,
              vol: getVolumeColor(1, isDark),
            },
          ] as const
        ).map((item) => {
          const active = volumeFilter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              accessibilityRole="button"
              style={[
                styles.legendPill,
                {
                  backgroundColor: item.vol.bg,
                  borderColor: active ? colors.text : item.vol.border,
                  borderWidth: active ? 2 : 1,
                },
              ]}
              onPress={() =>
                setVolumeFilter((prev) => (prev === item.key ? 'ALL' : item.key))
              }
            >
              <View
                style={[styles.legendDot, { backgroundColor: item.vol.hex }]}
              />
              <Text
                style={[styles.legendText, { color: item.vol.text }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter, Search & Sort Card */}
      <View
        style={[
          styles.filterCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.filterTopRow}>
          <View style={styles.filterPickerCol}>
            <Text
              style={[styles.filterPrefixLabel, { color: colors.secondary }]}
            >
              Category
            </Text>
            <View style={styles.filterPickerWrap}>
              <Picker
                selectedValue={categoryFilter}
                onValueChange={(v) => setCategoryFilter(String(v))}
                style={{ color: colors.text, width: '100%' }}
                dropdownIconColor={colors.text}
              >
                <Picker.Item
                  label={`All Categories (${filteredReports.length})`}
                  value="ALL"
                />
                {incidentCategories.map((c) => (
                  <Picker.Item key={c.$id} label={c.name} value={c.name} />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        <View style={styles.searchSortRow}>
          <View
            style={[
              styles.brgySearchWrap,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.brgySearchInput, { color: colors.text }]}
              placeholder="Filter barangay..."
              placeholderTextColor={colors.secondary}
              value={barangaySearch}
              onChangeText={setBarangaySearch}
            />
            {barangaySearch.length > 0 && (
              <TouchableOpacity
                onPress={() => setBarangaySearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.searchClearBtn}
              >
                <Text style={{ color: colors.secondary, fontWeight: 'bold' }}>
                  ✕
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sortChipsRow}>
            {(
              [
                { key: 'count', label: 'Volume' },
                { key: 'latest', label: 'Latest' },
                { key: 'az', label: 'A–Z' },
              ] as const
            ).map((opt) => {
              const active = sortMode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.sortChip,
                    {
                      backgroundColor: active
                        ? colors.primaryMuted
                        : colors.surfaceMuted,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSortMode(opt.key)}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      { color: active ? colors.primary : colors.secondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Grouped Barangay List with Expandable Coordinates */}
      <FlatList
        data={displayedBarangayGroups}
        keyExtractor={(item) => item.barangay}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {hasActiveFilters
                ? 'No Matching Barangays'
                : 'No Submitted Incident Reports'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.secondary }]}>
              {hasActiveFilters
                ? 'No submitted incident reports match the active category, volume, or barangay filters.'
                : 'Tap the map or "+ Log Incident" to submit a field report.'}
            </Text>
            {hasActiveFilters ? (
              <TouchableOpacity
                style={[
                  styles.emptyResetBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={resetAllFilters}
              >
                <Text style={styles.emptyResetBtnText}>Reset All Filters</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.emptyResetBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => openSubmitForBarangay(selectedBarangay)}
              >
                <Text style={styles.emptyResetBtnText}>
                  + Log First Incident
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const vol = getVolumeColor(item.count, isDark);
          const isExpanded = expandedBarangay === item.barangay;

          return (
            <TouchableOpacity
              style={[
                styles.groupCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderLeftColor: vol.border,
                },
              ]}
              activeOpacity={0.75}
              onPress={() => {
                const next = isExpanded ? null : item.barangay;
                setExpandedBarangay(next);
                if (next && inlineWebViewRef.current && !isMapCollapsed) {
                  inlineWebViewRef.current.injectJavaScript(
                    `window.__focusSurveillanceCoords && window.__focusSurveillanceCoords(${item.coords.latitude}, ${item.coords.longitude}, 14); true;`
                  );
                }
              }}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.brgyTitle, { color: colors.text }]}>
                    Brgy. {item.barangay}
                  </Text>
                  <Text
                    style={[styles.volumeLabel, { color: colors.secondary }]}
                  >
                    {vol.label}
                  </Text>
                </View>
                <View style={styles.badgeChevronRow}>
                  <View
                    style={[styles.countBadge, { backgroundColor: vol.bg }]}
                  >
                    <Text style={[styles.countText, { color: vol.text }]}>
                      {item.count} Report{item.count > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text
                    style={[styles.chevronText, { color: colors.secondary }]}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </View>
              </View>

              {isExpanded && (
                <View
                  style={[
                    styles.expandedList,
                    { borderTopColor: colors.border },
                  ]}
                >
                  {item.reports.map((rep) => (
                    <TouchableOpacity
                      key={rep.$id}
                      style={[
                        styles.reportRow,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                      accessibilityRole="button"
                      onPress={() => openReportDetails(rep.$id)}
                    >
                      <View style={styles.reportTopRow}>
                        <Text
                          style={[styles.reportCat, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {rep.diseaseType}
                        </Text>
                        <View
                          style={[
                            styles.reportRoleBadge,
                            { backgroundColor: colors.primaryMuted },
                          ]}
                        >
                          <Text
                            style={[
                              styles.reportRoleText,
                              { color: colors.primary },
                            ]}
                          >
                            {rep.reporterRole || 'owner'}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.reportCoords,
                          { color: colors.secondary },
                        ]}
                      >
                        GPS: {Number(rep.latitude).toFixed(5)},{' '}
                        {Number(rep.longitude).toFixed(5)}
                      </Text>
                      {rep.description ? (
                        <Text
                          style={[styles.reportDesc, { color: colors.text }]}
                        >
                          {rep.description}
                        </Text>
                      ) : null}
                      <View style={styles.reportFooterRow}>
                        <Text
                          style={[
                            styles.reportDate,
                            { color: colors.secondary },
                          ]}
                        >
                          {new Date(
                            rep.reportedAt || rep.$createdAt || Date.now()
                          ).toLocaleString()}
                        </Text>
                        <Text
                          style={[
                            styles.viewDetailLink,
                            { color: colors.primary },
                          ]}
                        >
                          Details ›
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {ILIGAN_BARANGAYS.includes(
                    item.barangay as IliganBarangay
                  ) && (
                    <TouchableOpacity
                      style={[
                        styles.quickLogBrgyBtn,
                        {
                          backgroundColor: colors.primaryMuted,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() =>
                        openSubmitForBarangay(item.barangay as IliganBarangay)
                      }
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 12,
                          fontWeight: 'bold',
                        }}
                      >
                        + Log New Incident in Brgy. {item.barangay}
                      </Text>
                    </TouchableOpacity>
                  )}
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
        onRequestClose={closeDetailModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                maxHeight: '88%',
                borderRadius: 22,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.text, flex: 1, marginBottom: 0 },
                ]}
              >
                Incident Report Details
              </Text>
              <TouchableOpacity
                style={[
                  styles.modalCloseIconBtn,
                  { backgroundColor: colors.surfaceMuted },
                ]}
                onPress={closeDetailModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  style={{
                    color: colors.secondary,
                    fontSize: 15,
                    fontWeight: 'bold',
                  }}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {reportLoading ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={{ marginVertical: 24 }}
                />
              ) : null}

              {reportError ? (
                <View
                  style={[
                    styles.detailErrorBox,
                    {
                      backgroundColor: semantic.dangerBg,
                      borderColor: semantic.dangerBorder,
                    },
                  ]}
                >
                  <Text style={{ color: colors.danger, fontSize: 13 }}>
                    {reportError}
                  </Text>
                  {lastDetailIdRef.current && (
                    <TouchableOpacity
                      style={[
                        styles.retryBtn,
                        { backgroundColor: colors.danger },
                      ]}
                      onPress={() =>
                        openReportDetails(lastDetailIdRef.current!)
                      }
                    >
                      <Text style={styles.retryBtnText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              {selectedReport ? (
                <View style={styles.detailContainer}>
                  <View style={styles.detailHeaderRow}>
                    <Text
                      style={[
                        styles.detailDiseaseTitle,
                        { color: colors.text },
                      ]}
                    >
                      {selectedReport.diseaseType}
                    </Text>
                    <View
                      style={[
                        styles.detailStatusBadge,
                        {
                          backgroundColor:
                            String(selectedReport.status || '').toLowerCase() ===
                            'archived'
                              ? semantic.dangerBg
                              : colors.primaryMuted,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailStatusText,
                          {
                            color:
                              String(
                                selectedReport.status || ''
                              ).toLowerCase() === 'archived'
                                ? colors.danger
                                : colors.primary,
                          },
                        ]}
                      >
                        {selectedReport.status || 'pending'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.detailMetaGrid,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.detailMetaItem}>
                      <Text
                        style={[
                          styles.detailMetaLabel,
                          { color: colors.secondary },
                        ]}
                      >
                        Reporter
                      </Text>
                      <Text
                        style={[styles.detailMetaValue, { color: colors.text }]}
                      >
                        {selectedReport.reporterName} (
                        {selectedReport.reporterRole || 'staff'})
                      </Text>
                    </View>
                    <View style={styles.detailMetaItem}>
                      <Text
                        style={[
                          styles.detailMetaLabel,
                          { color: colors.secondary },
                        ]}
                      >
                        Barangay
                      </Text>
                      <Text
                        style={[styles.detailMetaValue, { color: colors.text }]}
                      >
                        Brgy. {selectedReport.barangay}
                      </Text>
                    </View>
                    <View style={styles.detailMetaItem}>
                      <Text
                        style={[
                          styles.detailMetaLabel,
                          { color: colors.secondary },
                        ]}
                      >
                        Reported Date
                      </Text>
                      <Text
                        style={[styles.detailMetaValue, { color: colors.text }]}
                      >
                        {new Date(
                          selectedReport.reportedAt || Date.now()
                        ).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.detailMetaItem}>
                      <Text
                        style={[
                          styles.detailMetaLabel,
                          { color: colors.secondary },
                        ]}
                      >
                        Coordinates
                      </Text>
                      <Text
                        style={[styles.detailMetaValue, { color: colors.text }]}
                      >
                        {Number(selectedReport.latitude).toFixed(5)},{' '}
                        {Number(selectedReport.longitude).toFixed(5)}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[styles.detailSectionTitle, { color: colors.text }]}
                  >
                    Field Notes
                  </Text>
                  <View
                    style={[
                      styles.detailNotesCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailNotesText,
                        { color: colors.secondary },
                      ]}
                    >
                      {selectedReport.description ||
                        'No additional notes provided.'}
                    </Text>
                  </View>

                  <Text
                    style={[styles.detailSectionTitle, { color: colors.text }]}
                  >
                    Evidence Photo
                  </Text>
                  {selectedReport.photoUrl && !detailPhotoFailed ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        setPreviewPhotoUri(selectedReport.photoUrl || null)
                      }
                      style={[
                        styles.detailPhotoWrap,
                        { borderColor: colors.border },
                      ]}
                    >
                      <Image
                        source={{ uri: selectedReport.photoUrl }}
                        style={[
                          styles.detailPhoto,
                          { backgroundColor: colors.surfaceMuted },
                        ]}
                        resizeMode="cover"
                        onLoadStart={() => setDetailPhotoLoading(true)}
                        onLoadEnd={() => setDetailPhotoLoading(false)}
                        onError={() => {
                          setDetailPhotoLoading(false);
                          setDetailPhotoFailed(true);
                        }}
                      />
                      {detailPhotoLoading && (
                        <View style={styles.photoLoaderOverlay}>
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        </View>
                      )}
                      {!detailPhotoLoading && (
                        <View style={styles.tapToZoomBadge}>
                          <Text style={styles.tapToZoomText}>
                            Tap to inspect photo
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.noPhotoBox,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.noPhotoText,
                          { color: colors.secondary },
                        ]}
                      >
                        {detailPhotoFailed
                          ? 'Evidence photo expired or could not load.'
                          : 'No photo attached to this report.'}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.osmLinkBtn,
                      {
                        backgroundColor: semantic.osmBg,
                        borderColor: semantic.osmBorder,
                      },
                    ]}
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
                      style={[
                        styles.osmLinkBtnText,
                        { color: semantic.osmText },
                      ]}
                    >
                      📍 Open Location in OpenStreetMap ↗
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={closeDetailModal}
              style={[
                styles.cancelBtn,
                { marginTop: 10, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.cancelBtnText, { color: colors.secondary }]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Evidence Photo Viewer */}
      <Modal
        visible={!!previewPhotoUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhotoUri(null)}
      >
        <View style={styles.photoPreviewOverlay}>
          <TouchableOpacity
            style={styles.photoPreviewCloseBtn}
            onPress={() => setPreviewPhotoUri(null)}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>✕ Close</Text>
          </TouchableOpacity>
          {previewPhotoUri && (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.photoPreviewFull}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Modal: Submit Field Incident (`submitDisease`) */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeSubmitModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Submit Field Incident
              </Text>

              <View
                style={[
                  styles.coordCalloutBox,
                  {
                    backgroundColor: colors.primaryMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.coordCalloutIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.coordCalloutTitle, { color: colors.text }]}
                  >
                    Brgy. {selectedBarangay} (
                    {pinSource === 'map' ? 'Map Pin' : 'Center'})
                  </Text>
                  <Text
                    style={[
                      styles.coordCalloutSub,
                      { color: colors.primary },
                    ]}
                  >
                    GPS: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
                  </Text>
                  <View style={styles.coordActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.coordMiniBtn,
                        { backgroundColor: colors.surface },
                      ]}
                      disabled={isSubmitting}
                      onPress={() => {
                        reopenSubmitAfterMapRef.current = true;
                        setIsModalVisible(false);
                        setFullscreen(true);
                      }}
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 11,
                          fontWeight: 'bold',
                        }}
                      >
                        🗺️ Pick on Map
                      </Text>
                    </TouchableOpacity>
                    {pinSource === 'map' && (
                      <TouchableOpacity
                        style={[
                          styles.coordMiniBtn,
                          { backgroundColor: colors.surface },
                        ]}
                        disabled={isSubmitting}
                        onPress={() => {
                          const c = getBarangayCoords(selectedBarangay);
                          setPinLat(c.latitude);
                          setPinLng(c.longitude);
                          setPinSource('barangay');
                        }}
                      >
                        <Text
                          style={{
                            color: colors.secondary,
                            fontSize: 11,
                            fontWeight: 'bold',
                          }}
                        >
                          Snap to Brgy. Center
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              <Text style={[styles.label, { color: colors.secondary }]}>
                Active Incident Category *
              </Text>
              {incidentCategories.length === 0 ? (
                <View
                  style={[
                    styles.emptyCatBox,
                    {
                      backgroundColor: semantic.dangerBg,
                      borderColor: semantic.dangerBorder,
                    },
                  ]}
                >
                  <Text style={{ color: colors.danger, fontSize: 12, flex: 1 }}>
                    No active CVO categories loaded yet.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.retryBtn,
                      { backgroundColor: colors.danger },
                    ]}
                    disabled={reloadingCategories}
                    onPress={handleRetryCategories}
                  >
                    <Text style={styles.retryBtnText}>
                      {reloadingCategories ? 'Loading...' : 'Retry'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View
                  style={[
                    styles.pickerBox,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Picker
                    title="Select Incident Category"
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
              )}

              <Text style={[styles.label, { color: colors.secondary }]}>
                Barangay (Iligan City) *
              </Text>
              <View
                style={[
                  styles.pickerBox,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Picker
                  selectedValue={selectedBarangay}
                  onValueChange={(val) => {
                    const brgy = val as IliganBarangay;
                    setSelectedBarangay(brgy);
                    if (pinSource !== 'map') {
                      const c = getBarangayCoords(brgy);
                      setPinLat(c.latitude);
                      setPinLng(c.longitude);
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {ILIGAN_BARANGAYS.map((brgy) => (
                    <Picker.Item key={brgy} label={brgy} value={brgy} />
                  ))}
                </Picker>
              </View>

              <View style={styles.notesLabelRow}>
                <Text style={[styles.label, { color: colors.secondary }]}>
                  Field Notes (Optional)
                </Text>
                <Text
                  style={{
                    color: colors.secondary,
                    fontSize: 11,
                    marginTop: 8,
                  }}
                >
                  {notes.length}/1000
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    height: 88,
                    textAlignVertical: 'top',
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="Enter field observations..."
                placeholderTextColor={colors.secondary}
                value={notes}
                onChangeText={setNotes}
                maxLength={1000}
                multiline
              />

              <Text style={[styles.label, { color: colors.secondary }]}>
                Evidence photo (optional; max 5 MB)
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={pickEvidence}
                style={[
                  styles.pickerBox,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.primary,
                    paddingHorizontal: 12,
                    fontWeight: '600',
                  }}
                >
                  {evidenceDraft
                    ? `✓ ${evidenceDraft.asset.fileName || 'Photo selected'}`
                    : '+ Attach evidence photo'}
                </Text>
              </TouchableOpacity>
              {evidenceDraft ? (
                <View style={{ marginTop: 8 }}>
                  <Image
                    source={{ uri: evidenceDraft.asset.uri }}
                    style={{ height: 125, borderRadius: 10 }}
                  />
                  <TouchableOpacity
                    disabled={isSubmitting}
                    onPress={() => setEvidenceDraft(null)}
                    style={[
                      styles.removePhotoBtn,
                      {
                        backgroundColor: semantic.dangerBg,
                        borderColor: semantic.dangerBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.danger,
                        fontSize: 12,
                        fontWeight: 'bold',
                      }}
                    >
                      Remove photo
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  disabled={isSubmitting}
                  onPress={closeSubmitModal}
                >
                  <Text
                    style={[
                      styles.cancelBtnText,
                      { color: colors.secondary },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (!selectedCategory || isSubmitting) && { opacity: 0.55 },
                  ]}
                  onPress={handleSubmitOfficerReport}
                  disabled={!selectedCategory || isSubmitting}
                >
                  {isSubmitting ? (
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
  container: { flex: 1, backgroundColor: '#F2F5FA' },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSub: { fontSize: 11, marginTop: 2 },
  newReportBtn: {
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newReportBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  collapsedMapBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  collapsedMapBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  mapBox: { height: 225, width: '100%', position: 'relative' },
  mapOverlayControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    gap: 6,
  },
  mapOverlayBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  mapFullscreenBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  legendBar: {
    flexDirection: 'row',
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  legendPill: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  legendText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterCard: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  filterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPickerCol: {
    flex: 1,
  },
  filterPrefixLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  filterPickerWrap: {
    height: 44,
    justifyContent: 'center',
  },
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brgySearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
  },
  brgySearchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  searchClearBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  sortChipsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sortChip: {
    height: 38,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  listContent: { padding: 14, paddingTop: 6, paddingBottom: 36 },
  emptyBox: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    marginTop: 8,
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold' },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyResetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  groupCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brgyTitle: { fontSize: 16, fontWeight: 'bold' },
  volumeLabel: { fontSize: 11, marginTop: 2 },
  badgeChevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  countText: { fontSize: 12, fontWeight: 'bold' },
  chevronText: { fontSize: 12, fontWeight: 'bold' },
  expandedList: {
    marginTop: 14,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  reportRow: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reportCat: { fontSize: 14, fontWeight: 'bold', flex: 1, marginRight: 8 },
  reportRoleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  reportRoleText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  reportCoords: { fontSize: 11, fontWeight: '600' },
  reportDesc: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  reportFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  reportDate: { fontSize: 11 },
  viewDetailLink: {
    fontWeight: '700',
    fontSize: 12,
  },
  quickLogBrgyBtn: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modalCloseIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  detailErrorBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  detailContainer: { marginTop: 4 },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailDiseaseTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  detailStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  detailMetaGrid: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  detailMetaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailMetaLabel: { fontSize: 11, fontWeight: '600' },
  detailMetaValue: {
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
  },
  detailNotesCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  detailNotesText: { fontSize: 13, lineHeight: 18 },
  detailPhotoWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 8,
    position: 'relative',
  },
  detailPhoto: { height: 220, width: '100%' },
  photoLoaderOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  tapToZoomBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tapToZoomText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  noPhotoBox: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  noPhotoText: { fontSize: 12 },
  osmLinkBtn: {
    borderWidth: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  osmLinkBtnText: { fontWeight: 'bold', fontSize: 13 },
  photoPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoPreviewCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  photoPreviewFull: { width: '100%', height: '78%' },
  coordCalloutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  coordCalloutIcon: { fontSize: 20, marginTop: 2 },
  coordCalloutTitle: { fontSize: 13, fontWeight: 'bold' },
  coordCalloutSub: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  coordActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  coordMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  emptyCatBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerBox: {
    borderWidth: 1,
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  notesLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
  },
  removePhotoBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});
