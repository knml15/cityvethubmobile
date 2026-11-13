import { useAppPalette, useThemedStyles } from '../../theme';
import NotificationBell from '../../components/NotificationBell';
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveSync } from '../../utils/useLiveSync';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { operate } from '../../api/client';
import { useAuthStore, useSurveillanceStore } from '../../store';
import { CommunityNotice } from '../../store/types/adoption';

type SeverityLevel = 'high' | 'medium' | 'low';
type SeverityFilterKey = 'ALL' | SeverityLevel;
type SourceFilterKey = 'ALL' | 'alert' | 'notice';

interface StaffFeedItem {
  id: string;
  source: 'alert' | 'notice';
  isOutbreak: boolean;
  title: string;
  body: string;
  category: string;
  severity: SeverityLevel;
  barangay: string;
  date: string;
  sortTime: number;
}

const SEVERITY_FILTERS: ReadonlyArray<{ key: SeverityFilterKey; label: string }> = [
  { key: 'ALL', label: '📋 All' },
  { key: 'high', label: '🚨 High' },
  { key: 'medium', label: '⚠️ Medium' },
  { key: 'low', label: 'ℹ️ Info' },
];

const SOURCE_FILTERS: ReadonlyArray<{ key: SourceFilterKey; label: string }> = [
  { key: 'ALL', label: 'All Sources' },
  { key: 'alert', label: 'Disease Alerts' },
  { key: 'notice', label: 'CVO Notices' },
];

function normalizeSeverity(raw?: string, isOutbreak?: boolean): SeverityLevel {
  if (isOutbreak) return 'high';
  const s = String(raw || '').trim().toLowerCase();
  if (/high|critical|urgent|severe|outbreak/.test(s)) return 'high';
  if (/medium|moderate|warn|elevated/.test(s)) return 'medium';
  return 'low';
}

function severityRank(level: SeverityLevel): number {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

function formatIssuedTimestamp(rawDate: string): string {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return 'Issued recently';
  const diffMs = Date.now() - parsed.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const shortDate = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  if (diffMins < 1) return `Just now • ${shortDate}`;
  if (diffMins < 60) return `${diffMins}m ago • ${shortDate}`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago • ${shortDate}`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago • ${shortDate}`;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getSeverityMeta(
  severity: SeverityLevel,
  palette: ReturnType<typeof useAppPalette>,
  isDark: boolean
) {
  if (severity === 'high') {
    return {
      border: palette.danger,
      bg: isDark ? '#3E1C24' : '#FEE2E2',
      text: isDark ? '#FB8794' : '#991B1B',
      cardBg: isDark ? '#261820' : '#FFF8F8',
      cardBorder: isDark ? '#5A2A37' : '#FECACA',
      label: '🚨 High Priority',
    };
  }
  if (severity === 'medium') {
    return {
      border: isDark ? '#FBBF24' : '#F59E0B',
      bg: isDark ? '#3B2B12' : '#FEF3C7',
      text: isDark ? '#FCD34D' : '#92400E',
      cardBg: isDark ? '#241F15' : '#FFFDF5',
      cardBorder: isDark ? '#543E1A' : '#FDE68A',
      label: '⚠️ Medium Priority',
    };
  }
  return {
    border: palette.primary,
    bg: palette.primaryMuted,
    text: palette.primary,
    cardBg: palette.surface,
    cardBorder: palette.border,
    label: 'ℹ️ Info / Notice',
  };
}

export default function OcularQueueScreen() {
  const palette = useAppPalette();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const isDark = user?.theme === 'dark';
  const { activeAlerts, fetchDiseaseAlerts } = useSurveillanceStore();

  const [staffNotices, setStaffNotices] = useState<CommunityNotice[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterKey>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const hasLoadedOnceRef = useRef(false);

  const loadStaffAlertsAndNotices = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const [, noticesRes] = await Promise.all([
          fetchDiseaseAlerts(silent),
          operate<{ notices?: CommunityNotice[] }>('communityOfficialNotices', {}),
        ]);
        setStaffNotices(Array.isArray(noticesRes?.notices) ? noticesRes.notices : []);
        setFeedError(null);
      } catch (err: any) {
        setFeedError(
          err?.message || 'Unable to sync latest CVO alerts and notices.'
        );
      } finally {
        hasLoadedOnceRef.current = true;
        if (!silent) setIsLoading(false);
      }
    },
    [fetchDiseaseAlerts]
  );

  useFocusEffect(
    useCallback(() => {
      loadStaffAlertsAndNotices(hasLoadedOnceRef.current);
    }, [loadStaffAlertsAndNotices])
  );

  useLiveSync(() => loadStaffAlertsAndNotices(true));

  // Normalize & sort combined alerts + CVO staff notices chronologically (newest first)
  const allItems = useMemo<StaffFeedItem[]>(() => {
    const mappedAlerts: StaffFeedItem[] = activeAlerts.map((a) => {
      const iso = a.created_at || new Date().toISOString();
      const ts = new Date(iso).getTime();
      return {
        id: `alert-${a.id}`,
        source: 'alert',
        isOutbreak: Boolean(a.isOutbreak),
        title: a.title,
        body: a.description || '',
        category: a.isOutbreak ? '🔥 OUTBREAK ALERT' : 'STAFF ADVISORY',
        severity: normalizeSeverity(a.severity, a.isOutbreak),
        barangay: String(a.barangay || 'Iligan City'),
        date: iso,
        sortTime: Number.isNaN(ts) ? 0 : ts,
      };
    });

    const mappedNotices: StaffFeedItem[] = staffNotices.map((n) => {
      const iso = n.date || new Date().toISOString();
      const ts = new Date(iso).getTime();
      return {
        id: `notice-${n.id}`,
        source: 'notice',
        isOutbreak: false,
        title: n.title,
        body: String(n.body || '').replace(
          /^\[Barangay:\s*([^\]]+)\]\s*\n?/i,
          ''
        ),
        category: `CVO ${String(n.category || 'ANNOUNCEMENT').toUpperCase()}`,
        severity: normalizeSeverity(n.priority, false),
        barangay: n.barangay || 'All Barangays',
        date: iso,
        sortTime: Number.isNaN(ts) ? 0 : ts,
      };
    });

    return [...mappedAlerts, ...mappedNotices].sort((a, b) => {
      if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
      return severityRank(b.severity) - severityRank(a.severity);
    });
  }, [activeAlerts, staffNotices]);

  const sourceAndSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        item.barangay.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [allItems, sourceFilter, searchQuery]);

  const severityCounts = useMemo(() => {
    const counts: Record<SeverityFilterKey, number> = {
      ALL: sourceAndSearchItems.length,
      high: 0,
      medium: 0,
      low: 0,
    };
    sourceAndSearchItems.forEach((item) => {
      counts[item.severity] += 1;
    });
    return counts;
  }, [sourceAndSearchItems]);

  const combinedFeed = useMemo(() => {
    if (severityFilter === 'ALL') return sourceAndSearchItems;
    return sourceAndSearchItems.filter((item) => item.severity === severityFilter);
  }, [sourceAndSearchItems, severityFilter]);

  const hasActiveFilters =
    severityFilter !== 'ALL' ||
    sourceFilter !== 'ALL' ||
    searchQuery.trim().length > 0;

  const resetAllFilters = () => {
    setSeverityFilter('ALL');
    setSourceFilter('ALL');
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#0D1520' : '#162337',
            borderBottomColor: palette.border,
            borderBottomWidth: isDark ? 1 : 0,
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Staff Alerts & CVO Announcements
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {user?.position || 'Field Officer'} • {allItems.length} active notice(s)
          </Text>
        </View>
        <NotificationBell />
      </View>

      {/* Filter Controls: Search, Source Pills & Segmented Priority Bar */}
      <View style={styles.filterWrap}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Filter by barangay, disease, or keyword..."
            placeholderTextColor={palette.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                Keyboard.dismiss();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.clearSearchBtn}
            >
              <Text style={[styles.clearSearchText, { color: palette.secondary }]}>
                ✕
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          {SEVERITY_FILTERS.map((sev) => {
            const isActive = severityFilter === sev.key;
            const count = severityCounts[sev.key];
            return (
              <TouchableOpacity
                key={sev.key}
                style={[styles.sevChip, isActive && styles.sevChipActive]}
                onPress={() => setSeverityFilter(sev.key)}
              >
                <Text
                  style={[
                    styles.sevChipText,
                    isActive && { color: palette.primary },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {sev.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sourceFilterRow}>
          {SOURCE_FILTERS.map((src) => {
            const active = sourceFilter === src.key;
            return (
              <TouchableOpacity
                key={src.key}
                style={[
                  styles.sourceChip,
                  {
                    borderColor: active ? palette.primary : palette.border,
                    backgroundColor: active
                      ? palette.primaryMuted
                      : palette.surfaceMuted,
                  },
                ]}
                onPress={() => setSourceFilter(src.key)}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    { color: active ? palette.primary : palette.secondary },
                  ]}
                  numberOfLines={1}
                >
                  {src.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {feedError ? (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: isDark ? '#3E1C24' : '#FEE2E2',
              borderColor: isDark ? '#662A36' : '#FCA5A5',
            },
          ]}
        >
          <Text
            style={[
              styles.errorBannerText,
              { color: isDark ? '#FB8794' : '#991B1B' },
            ]}
          >
            {feedError}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: palette.primary }]}
            onPress={() => loadStaffAlertsAndNotices(false)}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading && combinedFeed.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>
            Loading active staff advisories...
          </Text>
        </View>
      ) : (
        <FlatList
          data={combinedFeed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => loadStaffAlertsAndNotices(false)}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>{feedError ? '⚠️' : '📢'}</Text>
              <Text style={styles.emptyTitle}>
                {feedError
                  ? 'Unable to Load Advisories'
                  : hasActiveFilters
                  ? 'No Matching Advisories'
                  : 'No Active Staff Outbreaks or Announcements'}
              </Text>
              <Text style={styles.emptySub}>
                {feedError
                  ? 'Check your connection and tap Retry below.'
                  : hasActiveFilters
                  ? 'No active alerts or CVO notices match your current priority, source, or search filter.'
                  : 'All caught up! New outbreak declarations and CVO staff bulletins will appear here.'}
              </Text>
              <TouchableOpacity
                style={[styles.emptyResetBtn, { backgroundColor: palette.primary }]}
                onPress={
                  hasActiveFilters && !feedError
                    ? resetAllFilters
                    : () => loadStaffAlertsAndNotices(false)
                }
              >
                <Text style={styles.emptyResetBtnText}>
                  {hasActiveFilters && !feedError
                    ? 'Reset Filters'
                    : '↻ Refresh Advisories'}
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const sevMeta = getSeverityMeta(item.severity, palette, isDark);
            const isExpanded = Boolean(expandedIds[item.id]);
            const isLongBody =
              item.body.length > 160 || item.body.split('\n').length > 3;

            return (
              <View
                style={[
                  styles.card,
                  {
                    borderLeftColor: sevMeta.border,
                    backgroundColor: item.isOutbreak
                      ? sevMeta.cardBg
                      : palette.surface,
                    borderColor: item.isOutbreak
                      ? sevMeta.cardBorder
                      : palette.border,
                  },
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.catBadgeWrap,
                      item.isOutbreak && { backgroundColor: sevMeta.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catBadge,
                        item.isOutbreak && { color: sevMeta.text },
                      ]}
                    >
                      {item.category}
                    </Text>
                  </View>
                  <View
                    style={[styles.sevBadgeWrap, { backgroundColor: sevMeta.bg }]}
                  >
                    <Text style={[styles.sevBadgeText, { color: sevMeta.text }]}>
                      {sevMeta.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.alertTitle}>{item.title}</Text>

                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.locationTagWrap,
                      {
                        backgroundColor: palette.primaryMuted,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.locationTag, { color: palette.primary }]}
                      numberOfLines={1}
                    >
                      📍 Brgy. {item.barangay}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>
                    {formatIssuedTimestamp(item.date)}
                  </Text>
                </View>

                <Text
                  style={styles.bodyText}
                  numberOfLines={isLongBody && !isExpanded ? 4 : undefined}
                >
                  {item.body}
                </Text>

                {isLongBody ? (
                  <TouchableOpacity
                    onPress={() => toggleExpand(item.id)}
                    style={styles.expandToggleBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text
                      style={[styles.expandToggleText, { color: palette.primary }]}
                    >
                      {isExpanded ? 'Show less ▲' : 'Read full advisory ▼'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#162337',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  filterWrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: { fontSize: 14, fontWeight: 'bold' },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  sevChip: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sevChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  sevChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  sourceFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sourceChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  listContent: { padding: 16, paddingBottom: 36 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    marginTop: 12,
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 14,
    backgroundColor: '#3478F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyResetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  catBadgeWrap: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  catBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
  },
  sevBadgeWrap: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sevBadgeText: { fontSize: 10, fontWeight: 'bold' },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  locationTagWrap: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 1,
  },
  locationTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 20 },
  expandToggleBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
  },
  expandToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
});