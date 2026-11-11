import { useThemedStyles } from '../../theme';
import NotificationBell from '../../components/NotificationBell';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { operate } from '../../api/client';
import { useAuthStore, useSurveillanceStore } from '../../store';
import { CommunityNotice } from '../../store/types/adoption';

export default function OcularQueueScreen() {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { activeAlerts, fetchDiseaseAlerts } = useSurveillanceStore();

  const [staffNotices, setStaffNotices] = useState<CommunityNotice[]>([]);
  const [severityFilter, setSeverityFilter] = useState<
    'ALL' | 'high' | 'medium' | 'low'
  >('ALL');
  const [isLoading, setIsLoading] = useState(false);

  const loadStaffAlertsAndNotices = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchDiseaseAlerts();
      const res = await operate<{ notices?: CommunityNotice[] }>(
        'communityOfficialNotices',
        {}
      ).catch(() => ({ notices: [] }));
      setStaffNotices(Array.isArray(res?.notices) ? res.notices : []);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDiseaseAlerts]);

  useFocusEffect(
    useCallback(() => {
      loadStaffAlertsAndNotices();
    }, [loadStaffAlertsAndNotices])
  );

  // Combine `disease_alerts` with officer-targeted `communityOfficialNotices`
  const combinedFeed = [
    ...activeAlerts.map((a) => ({
      id: `alert-${a.id}`,
      title: a.title,
      body: a.description,
      category: a.isOutbreak ? 'OUTBREAK DECLARATION' : 'STAFF ADVISORY',
      severity: String(a.severity || 'medium').toLowerCase(),
      barangay: String(a.barangay || 'Iligan City'),
      date: a.created_at || new Date().toISOString(),
    })),
    ...staffNotices.map((n) => ({
      id: `notice-${n.id}`,
      title: n.title,
      body: n.body,
      category: `CVO ${String(n.category || 'ANNOUNCEMENT').toUpperCase()}`,
      severity: String(n.priority || 'info').toLowerCase(),
      barangay: n.barangay || 'All Barangays',
      date: n.date || new Date().toISOString(),
    })),
  ].filter((item) => {
    if (severityFilter === 'ALL') return true;
    return item.severity === severityFilter;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Staff Alerts & CVO Announcements
          </Text>
          <Text style={styles.headerSub}>
            CVO Field Officer Portal • {user?.position || 'Field Officer'} •{' '}
            {combinedFeed.length} active notice(s)
          </Text>
        </View>
        <NotificationBell />
      </View>

      <View style={styles.filterRow}>
        {(['ALL', 'high', 'medium', 'low'] as const).map((sev) => (
          <TouchableOpacity
            key={sev}
            style={[
              styles.sevChip,
              severityFilter === sev && styles.sevChipActive,
            ]}
            onPress={() => setSeverityFilter(sev)}
          >
            <Text
              style={[
                styles.sevChipText,
                severityFilter === sev && styles.sevChipTextActive,
              ]}
            >
              {sev === 'ALL' ? 'All Priorities' : sev.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={combinedFeed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadStaffAlertsAndNotices}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No Active Staff Outbreaks or Announcements
            </Text>
            <Text style={styles.emptySub}>
              Pull down to refresh active alerts and CVO staff announcements.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              item.severity === 'high' && styles.cardHigh,
            ]}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.catBadge}>{item.category}</Text>
              <Text style={styles.sevBadgeText}>
                Priority: {item.severity.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.alertTitle}>{item.title}</Text>
            <Text style={styles.metaText}>📍 {item.barangay}</Text>
            <Text style={styles.bodyText}>{item.body}</Text>
            <Text style={styles.dateText}>
              Issued: {new Date(item.date).toLocaleString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sevChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  sevChipActive: { backgroundColor: '#1E293B' },
  sevChipText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  sevChipTextActive: { color: '#FFFFFF' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 28,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  emptySub: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHigh: { borderLeftWidth: 5, borderLeftColor: '#EF4444' },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catBadge: { fontSize: 11, fontWeight: 'bold', color: '#0284C7' },
  sevBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#B45309' },
  alertTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  metaText: { fontSize: 12, color: '#64748B', marginVertical: 4 },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  dateText: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
});