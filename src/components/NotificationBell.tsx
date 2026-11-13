import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  AppState,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useIsFocused,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Query } from 'react-native-appwrite';
import { useAppPalette, useThemedStyles } from '../theme';
import {
  useAuthStore,
  useAdoptionStore,
  useSurveillanceStore,
} from '../store';
import {
  databases,
  operate,
  subscribeDataChanged,
  APPWRITE_DATABASE_ID,
  TABLES,
} from '../api/client';
import {
  getMatchNotifications,
  readMatchNotification,
  PetMatchNotification,
} from '../api/phase422';
import { CommunityNotice } from '../store/types/adoption';
import {
  MedicalRecordRow,
  OwnershipEventRow,
  PetProfileRow,
} from '../store/types/pets';
import { OwnerVerificationRequestRow } from '../store/types/auth';
import { IncidentReportRow } from '../store/types/surveillance';

export type NotificationFilterCategory =
  | 'All'
  | 'Unread'
  | 'Community'
  | 'Adoptions'
  | 'Medical'
  | 'Alerts';

const FILTER_CATEGORIES: NotificationFilterCategory[] = [
  'All',
  'Unread',
  'Community',
  'Adoptions',
  'Medical',
  'Alerts',
];

type NotificationKind =
  | 'match'
  | 'application'
  | 'community'
  | 'medical'
  | 'verification'
  | 'ownership'
  | 'notice'
  | 'alert'
  | 'incident_report';

interface CommunityNotificationRaw {
  id?: string;
  $id?: string;
  type?: string;
  kind?: string;
  category?: string;
  title?: string;
  body?: string;
  message?: string;
  subtitle?: string;
  actorName?: string;
  authorName?: string;
  channelId?: string;
  channelName?: string;
  postId?: string;
  postTitle?: string;
  commentId?: string;
  barangay?: string;
  priority?: string;
  createdAt?: string;
  $createdAt?: string;
  date?: string;
  isRead?: boolean;
}

interface UnifiedNotificationItem {
  id: string;
  kind: NotificationKind;
  filterCategory: 'Community' | 'Adoptions' | 'Medical' | 'Alerts';
  categoryLabel: string;
  title: string;
  subtitle: string;
  timestamp: string;
  isRead: boolean;
  matchNote?: PetMatchNotification;
  channelId?: string;
  postId?: string;
  communityTab?: 'feed' | 'channels' | 'notices';
}

const memoryReadIdsByUser: Record<string, Set<string>> = {};
type ReadStateListener = (userId: string, nextReadIds: Set<string>) => void;
const readStateListeners = new Set<ReadStateListener>();

function broadcastReadIds(userId: string, nextSet: Set<string>) {
  memoryReadIdsByUser[userId] = nextSet;
  for (const listener of readStateListeners) {
    listener(userId, nextSet);
  }
}

function getStorageKey(userId: string): string {
  const safeId = String(userId).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `cvh_notif_read_${safeId}`;
}

export function buildPetDetailPayload(item: any, currentUserId?: string) {
  const pet = item?.registered_pet;
  if (!pet) return null;
  const isMyListing = Boolean(
    currentUserId && String(item.postedById) === String(currentUserId)
  );
  const housingTag =
    item.housingRequirement === 'apartment'
      ? '🏢 Apartment Friendly'
      : item.housingRequirement === 'house'
      ? '🏠 House Required'
      : item.housingRequirement === 'yard'
      ? '🌳 Yard Required'
      : '🏡 Any Housing';

  return {
    pet: {
      id: String(item.id),
      listingId: String(item.listingId || item.id),
      petId: String(item.petId || pet.id),
      petProfileId: String(item.petProfileId || item.petId || pet.id),
      postedById: item.postedById,
      ownerDisplayName: item.ownerDisplayName || 'Pet Owner',
      ownerAvatarUrl: item.ownerAvatarUrl,
      verificationStatus: item.verificationStatus,
      housingRequirement: item.housingRequirement || 'any',
      isActive: item.isActive,
      title: item.title || pet.name,
      name: pet.name,
      species: pet.species === 'CAT' ? 'Cat' : 'Dog',
      breed: pet.breed,
      age:
        pet.ageYears !== undefined ? `${pet.ageYears} yr(s)` : '1 yr(s)',
      gender: pet.gender === 'FEMALE' ? 'Female' : 'Male',
      barangay: pet.barangay,
      controlNumber: pet.registration_number,
      status: item.status || 'AVAILABLE',
      photoUrl: pet.photo,
      description: item.adoption_reason,
      healthClearance: item.requirements,
      temperament: [housingTag],
      vaccinations: (pet.vaccinations || []).map((v: any) => ({
        vaccine: v.vaccine_name || 'Vaccination',
        dateAdministered: v.administered_date || 'Recorded',
        administeringVet: v.administered_by || 'CVO Officer',
      })),
    },
    isOwned: isMyListing,
  };
}

function extractExpiryDate(rec: MedicalRecordRow): string | null {
  if (rec.expiryDate && String(rec.expiryDate).trim()) {
    return String(rec.expiryDate).trim();
  }
  const match = String(rec.description || '').match(
    /\[Exp:\s*(\d{4}-\d{2}-\d{2})\]/i
  );
  return match ? match[1] : null;
}

function formatRelativeTime(isoString: string): string {
  try {
    const timestamp = new Date(isoString).getTime();
    if (isNaN(timestamp)) return 'Recently';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

function getCategoryTagStyle(filterCategory: string) {
  switch (filterCategory) {
    case 'Alerts':
      return {
        bg: '#FEE2E2',
        border: '#FECACA',
        text: '#991B1B',
        accentBorder: '#EF4444',
      };
    case 'Adoptions':
      return {
        bg: '#DCFCE7',
        border: '#BBF7D0',
        text: '#166534',
        accentBorder: '#10B981',
      };
    case 'Medical':
      return {
        bg: '#E0F2FE',
        border: '#BAE6FD',
        text: '#0369A1',
        accentBorder: '#0284C7',
      };
    case 'Community':
    default:
      return {
        bg: '#F1F5F9',
        border: '#E2E8F0',
        text: '#475569',
        accentBorder: '#00AEEF',
      };
  }
}

function getCategoryEmptyState(category: NotificationFilterCategory) {
  switch (category) {
    case 'Unread':
      return {
        emoji: '✨',
        title: 'No unread notifications',
        subtitle: 'You are all caught up! New alerts and notices will appear here.',
      };
    case 'Alerts':
      return {
        emoji: '🛡️',
        title: 'No active health alerts',
        subtitle: 'No disease outbreak alerts or pending surveillance reports in your area.',
      };
    case 'Adoptions':
      return {
        emoji: '🐾',
        title: 'No adoption notifications',
        subtitle: 'No pending adoption applications, transfers, or matching companion listings.',
      };
    case 'Medical':
      return {
        emoji: '💉',
        title: 'Medical records up to date',
        subtitle: 'All veterinary clinical logs, vaccinations, and health reminders are clear.',
      };
    case 'Community':
      return {
        emoji: '💬',
        title: 'No community notices',
        subtitle: 'No new discussion replies, channel join requests, or CVO announcements.',
      };
    case 'All':
    default:
      return {
        emoji: '🎉',
        title: "You're all caught up!",
        subtitle: 'New community activity, adoption updates, medical reminders, and CVO advisories will appear here.',
      };
  }
}

export default function NotificationBell() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const { user } = useAuthStore();
  const {
    incomingApplications,
    myApplications,
    fetchIncomingApplications,
    fetchMyApplications,
  } = useAdoptionStore();
  const { activeAlerts, fetchDiseaseAlerts } = useSurveillanceStore();

  const isOfficer =
    user?.contractRole === 'officer' ||
    user?.role === 'VET_OFFICER' ||
    user?.role === 'CVO_ADMIN';

  const [visible, setVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] =
    useState<NotificationFilterCategory>('All');
  const [isLoading, setIsLoading] = useState(false);

  const [matchAlerts, setMatchAlerts] = useState<PetMatchNotification[]>([]);
  const [communityNotifs, setCommunityNotifs] = useState<
    CommunityNotificationRaw[]
  >([]);
  const [cvoNotices, setCvoNotices] = useState<CommunityNotice[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecordRow[]>([]);
  const [petNameMap, setPetNameMap] = useState<Record<string, string>>({});
  const [ownedPets, setOwnedPets] = useState<PetProfileRow[]>([]);
  const [idVerifRequests, setIdVerifRequests] = useState<
    OwnerVerificationRequestRow[]
  >([]);
  const [ownershipEvents, setOwnershipEvents] = useState<OwnershipEventRow[]>(
    []
  );
  const [pendingReports, setPendingReports] = useState<IncidentReportRow[]>([]);

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (user?.id && memoryReadIdsByUser[user.id]) {
      return new Set(memoryReadIdsByUser[user.id]);
    }
    return new Set();
  });

  // Subscribe to cross-screen readIds broadcasts across all mounted bell instances
  useEffect(() => {
    if (!user?.id) return;
    const targetUid = String(user.id);
    const onReadIdsChanged: ReadStateListener = (uid, nextSet) => {
      if (String(uid) === targetUid) {
        setReadIds(new Set(nextSet));
      }
    };
    readStateListeners.add(onReadIdsChanged);
    return () => {
      readStateListeners.delete(onReadIdsChanged);
    };
  }, [user?.id]);

  // Load persisted readIds for the current user
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const uid = String(user.id);
    const cached = memoryReadIdsByUser[uid];
    if (cached) {
      setReadIds(new Set(cached));
    }
    SecureStore.getItemAsync(getStorageKey(uid))
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const merged = new Set<string>([
              ...(memoryReadIdsByUser[uid] || []),
              ...parsed.map(String),
            ]);
            broadcastReadIds(uid, merged);
          }
        } catch {
          // Ignore malformed persisted set
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  const persistReadIds = useCallback(
    async (nextSet: Set<string>) => {
      if (!user?.id) return;
      const uid = String(user.id);
      const existing = memoryReadIdsByUser[uid] || new Set<string>();
      const merged = new Set<string>([...existing, ...nextSet]);
      broadcastReadIds(uid, merged);
      try {
        await SecureStore.setItemAsync(
          getStorageKey(uid),
          JSON.stringify(Array.from(merged).slice(-400))
        );
      } catch {
        // Best-effort persistence
      }
    },
    [user?.id]
  );

  const refreshNotifications = useCallback(async (silent = false) => {
    if (!user?.id) return;
    const uid = String(user.id);
    if (!silent) setIsLoading(true);
    try {
      // 1. Community Social & Official Notices (`communityNotifications` with fallback to `communityOfficialNotices`)
      const fetchCommunity = async () => {
        try {
          const commRes = await operate<{
            notifications?: CommunityNotificationRaw[];
            notices?: CommunityNotice[];
          }>('communityNotifications', {});
          const rawNotifs = Array.isArray(commRes?.notifications)
            ? commRes.notifications
            : [];
          setCommunityNotifs(rawNotifs);
          if (Array.isArray(commRes?.notices) && commRes.notices.length > 0) {
            setCvoNotices(commRes.notices);
            return;
          }
        } catch {
          setCommunityNotifs([]);
        }
        // Fallback / supplement with communityOfficialNotices
        try {
          const noticesRes = await operate<{ notices?: CommunityNotice[] }>(
            'communityOfficialNotices',
            {}
          );
          setCvoNotices(
            Array.isArray(noticesRes?.notices) ? noticesRes.notices : []
          );
        } catch {
          setCvoNotices([]);
        }
      };

      if (isOfficer) {
        const [, , reportsRes, medRes, petsRes] = await Promise.all([
          fetchCommunity(),
          fetchDiseaseAlerts(true).catch(() => {}),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.DISEASE_REPORTS, [
              Query.equal('status', 'pending'),
              Query.orderDesc('$createdAt'),
              Query.limit(50),
            ])
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.MEDICAL_RECORDS, [
              Query.orderDesc('$createdAt'),
              Query.limit(60),
            ])
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.PETS, [
              Query.orderDesc('$createdAt'),
              Query.limit(100),
            ])
            .catch(() => ({ documents: [] })),
        ]);

        setPendingReports(
          reportsRes.documents as unknown as IncidentReportRow[]
        );
        setMedicalRecords(medRes.documents as unknown as MedicalRecordRow[]);

        const nameLookup: Record<string, string> = {};
        for (const p of petsRes.documents as any[]) {
          if (p.$id && p.petName) nameLookup[p.$id] = p.petName;
          if (p.petProfileId && p.petName)
            nameLookup[p.petProfileId] = p.petName;
        }
        setPetNameMap(nameLookup);
      } else {
        const [
          ,
          matches,
          ,
          ,
          profilesRes,
          officialPetsRes,
          verifReqRes,
          newOwnerHistRes,
          prevOwnerHistRes,
        ] = await Promise.all([
          fetchCommunity(),
          getMatchNotifications().catch(() => []),
          fetchIncomingApplications(true).catch(() => {}),
          fetchMyApplications(true).catch(() => {}),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.PET_PROFILES, [
              Query.equal('ownerId', uid),
              Query.orderDesc('$createdAt'),
              Query.limit(100),
            ])
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.PETS, [
              Query.equal('ownerId', uid),
              Query.limit(100),
            ])
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(
              APPWRITE_DATABASE_ID,
              TABLES.OWNER_VERIFICATION_REQUESTS,
              [
                Query.equal('ownerId', uid),
                Query.orderDesc('$createdAt'),
                Query.limit(20),
              ]
            )
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.OWNERSHIP_HISTORY, [
              Query.equal('newOwnerId', uid),
              Query.orderDesc('$createdAt'),
              Query.limit(30),
            ])
            .catch(() => ({ documents: [] })),
          databases
            .listDocuments(APPWRITE_DATABASE_ID, TABLES.OWNERSHIP_HISTORY, [
              Query.equal('previousOwnerId', uid),
              Query.orderDesc('$createdAt'),
              Query.limit(30),
            ])
            .catch(() => ({ documents: [] })),
        ]);

        setMatchAlerts(Array.isArray(matches) ? matches : []);

        const profileDocs =
          profilesRes.documents as unknown as PetProfileRow[];
        setOwnedPets(profileDocs);
        setIdVerifRequests(
          verifReqRes.documents as unknown as OwnerVerificationRequestRow[]
        );

        const histMap = new Map<string, OwnershipEventRow>();
        for (const doc of [
          ...newOwnerHistRes.documents,
          ...prevOwnerHistRes.documents,
        ] as unknown as OwnershipEventRow[]) {
          if (doc.$id) histMap.set(doc.$id, doc);
        }
        setOwnershipEvents(Array.from(histMap.values()));

        const nameLookup: Record<string, string> = {};
        const petIdSet = new Set<string>();
        for (const p of profileDocs) {
          if (p.$id) {
            petIdSet.add(p.$id);
            nameLookup[p.$id] = p.petName || 'Companion';
          }
        }
        for (const op of officialPetsRes.documents as any[]) {
          if (op.$id) {
            petIdSet.add(op.$id);
            nameLookup[op.$id] = op.petName || 'Companion';
          }
          if (op.petProfileId) {
            petIdSet.add(op.petProfileId);
            if (op.petName && !nameLookup[op.petProfileId]) {
              nameLookup[op.petProfileId] = op.petName;
            }
          }
        }
        setPetNameMap(nameLookup);

        const targetPetIds = Array.from(petIdSet).slice(0, 100);
        if (targetPetIds.length > 0) {
          try {
            const medRes = await databases.listDocuments(
              APPWRITE_DATABASE_ID,
              TABLES.MEDICAL_RECORDS,
              [
                Query.equal('petId', targetPetIds),
                Query.orderDesc('$createdAt'),
                Query.limit(80),
              ]
            );
            setMedicalRecords(
              medRes.documents as unknown as MedicalRecordRow[]
            );
          } catch {
            setMedicalRecords([]);
          }
        } else {
          setMedicalRecords([]);
        }
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [
    user?.id,
    isOfficer,
    fetchDiseaseAlerts,
    fetchIncomingApplications,
    fetchMyApplications,
  ]);

  // Refresh on mount
  useEffect(() => {
    refreshNotifications(true);
  }, [refreshNotifications]);

  // Refresh when screen focuses
  useFocusEffect(
    useCallback(() => {
      if (user?.id && memoryReadIdsByUser[String(user.id)]) {
        setReadIds(new Set(memoryReadIdsByUser[String(user.id)]));
      }
      refreshNotifications(true);
    }, [user?.id, refreshNotifications])
  );

  // Live background sync (mutation broadcast + 15s interval + foreground resume)
  useEffect(() => {
    if (!isFocused || !user?.id || visible) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let currentAppState = AppState.currentState;

    const unsubscribeMutation = subscribeDataChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (AppState.currentState === 'active') {
          refreshNotifications(true);
        }
      }, 300);
    });

    const intervalId = setInterval(() => {
      if (AppState.currentState === 'active' && !isLoading) {
        refreshNotifications(true);
      }
    }, 15000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (currentAppState !== 'active' && nextState === 'active') {
        refreshNotifications(true);
      }
      currentAppState = nextState;
    });

    return () => {
      unsubscribeMutation();
      clearInterval(intervalId);
      appStateSub.remove();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isFocused, user?.id, visible, isLoading, refreshNotifications]);

  // Refresh when a push notification arrives in the foreground
  useEffect(() => {
    let receivedSub: Notifications.EventSubscription | null = null;
    try {
      receivedSub = Notifications.addNotificationReceivedListener(() => {
        refreshNotifications(true);
      });
    } catch {
      // Ignore if notifications listener is unavailable in Expo Go
    }
    return () => {
      try {
        receivedSub?.remove();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [refreshNotifications]);

  // Refresh when modal opens
  const handleOpenModal = () => {
    if (user?.id && memoryReadIdsByUser[String(user.id)]) {
      setReadIds(new Set(memoryReadIdsByUser[String(user.id)]));
    }
    setVisible(true);
    refreshNotifications();
  };

  const items = useMemo<UnifiedNotificationItem[]>(() => {
    const list: UnifiedNotificationItem[] = [];
    const seenIds = new Set<string>();

    const pushUnique = (item: UnifiedNotificationItem) => {
      if (seenIds.has(item.id)) return;
      seenIds.add(item.id);
      list.push(item);
    };

    const stripBarangayTag = (text: string) =>
      String(text || '').replace(/^\[Barangay:\s*([^\]]+)\]\s*\n?/i, '').trim();

    // 1. Community Social & Notices (`communityNotifications`)
    for (const raw of communityNotifs) {
      const rawId = String(
        raw.id ||
          raw.$id ||
          `${raw.type || 'comm'}-${raw.postId || ''}-${raw.commentId || ''}-${
            raw.createdAt || raw.date || ''
          }`
      );
      const itemId = `comm-${rawId}`;
      const nType = String(
        raw.type || raw.kind || raw.category || ''
      ).toLowerCase();

      let categoryLabel = '💬 COMMUNITY';
      let filterCategory: 'Community' | 'Adoptions' | 'Medical' | 'Alerts' =
        'Community';
      let communityTab: 'feed' | 'channels' | 'notices' = 'feed';

      if (nType === 'like_post') {
        categoryLabel = '👍 POST UPVOTE';
      } else if (nType === 'like_comment') {
        categoryLabel = '👍 COMMENT UPVOTE';
      } else if (nType === 'post_comment') {
        categoryLabel = '💬 NEW COMMENT';
      } else if (nType === 'comment_reply') {
        categoryLabel = '↩️ COMMENT REPLY';
      } else if (nType === 'join_request') {
        categoryLabel = '🔑 CHANNEL JOIN REQUEST';
        communityTab = 'channels';
      } else if (nType === 'join_status') {
        categoryLabel = '🔓 CHANNEL MEMBERSHIP';
        communityTab = 'channels';
      } else if (nType === 'channel_deleted') {
        categoryLabel = '🗑️ CHANNEL DELETED';
        communityTab = 'channels';
      } else if (nType === 'post_deleted') {
        categoryLabel = '🗑️ DISCUSSION DELETED';
        communityTab = 'feed';
      } else if (
        nType.includes('outbreak') ||
        nType.includes('alert') ||
        nType.includes('advisory') ||
        nType.includes('announcement') ||
        nType.includes('notice')
      ) {
        categoryLabel = `📢 CVO ${nType.toUpperCase()}`;
        filterCategory =
          nType.includes('outbreak') || nType.includes('alert')
            ? 'Alerts'
            : 'Community';
        communityTab = raw.channelId || raw.postId ? 'feed' : 'notices';
      }

      const defaultTitle =
        nType === 'like_post'
          ? `${raw.actorName || 'A member'} upvoted your post`
          : nType === 'like_comment'
          ? `${raw.actorName || 'A member'} upvoted your comment`
          : nType === 'post_comment'
          ? `${raw.actorName || 'A member'} commented on your post`
          : nType === 'comment_reply'
          ? `${raw.actorName || 'A member'} replied to your comment`
          : nType === 'join_request'
          ? `Join request for #${raw.channelName || 'channel'}`
          : nType === 'join_status'
          ? `Channel membership update: #${raw.channelName || 'channel'}`
          : nType === 'channel_deleted'
          ? `Channel #${raw.channelName || 'channel'} was deleted`
          : nType === 'post_deleted'
          ? `Discussion "${raw.postTitle || 'post'}" was removed`
          : 'Community Update';

      const rawSubtitle =
        raw.body ||
        raw.message ||
        raw.subtitle ||
        raw.postTitle ||
        (raw.channelName ? `Channel: #${raw.channelName}` : 'Tap to open in Community');

      pushUnique({
        id: itemId,
        kind: filterCategory === 'Alerts' ? 'alert' : 'community',
        filterCategory,
        categoryLabel,
        title: raw.title || defaultTitle,
        subtitle: stripBarangayTag(rawSubtitle),
        timestamp:
          raw.createdAt ||
          raw.$createdAt ||
          raw.date ||
          new Date().toISOString(),
        isRead: Boolean(raw.isRead) || readIds.has(itemId),
        channelId:
          raw.channelId && nType !== 'channel_deleted'
            ? String(raw.channelId)
            : undefined,
        postId:
          raw.postId && nType !== 'post_deleted' && nType !== 'channel_deleted'
            ? String(raw.postId)
            : undefined,
        communityTab,
      });
    }

    // 2. Fallback / Official CVO Notices (`communityOfficialNotices`)
    for (const notice of cvoNotices) {
      const itemId = `notice-${notice.id}`;
      const isOutbreakOrAlert =
        notice.category === 'outbreak' ||
        notice.priority === 'high' ||
        notice.priority === 'medium';
      const cleanedBody = stripBarangayTag(notice.body);
      pushUnique({
        id: itemId,
        kind: 'notice',
        filterCategory: isOutbreakOrAlert ? 'Alerts' : 'Community',
        categoryLabel: `📢 CVO ${String(
          notice.category || 'NOTICE'
        ).toUpperCase()}`,
        title: notice.title,
        subtitle: `${
          notice.barangay ? `Brgy. ${notice.barangay} • ` : ''
        }${cleanedBody}`,
        timestamp: notice.date || new Date().toISOString(),
        isRead: readIds.has(itemId),
        communityTab: 'notices',
      });
    }

    // 3. Medical & Vaccination Expiry Reminders (Both Owner & Officer)
    const nowMs = Date.now();
    for (const rec of medicalRecords) {
      const petName = petNameMap[rec.petId] || 'Registered Companion';
      const recId = `med-rec-${rec.$id}`;
      pushUnique({
        id: recId,
        kind: 'medical',
        filterCategory: 'Medical',
        categoryLabel: `💉 ${String(
          rec.recordType || 'MEDICAL'
        ).toUpperCase()} RECORD`,
        title: `${rec.medicineType || rec.recordType} — ${petName}`,
        subtitle:
          rec.description ||
          `Administered on ${new Date(
            rec.dateAdministered || rec.$createdAt || Date.now()
          ).toLocaleDateString()}`,
        timestamp:
          rec.dateAdministered || rec.$createdAt || new Date().toISOString(),
        isRead: readIds.has(recId),
      });

      const expiryStr = extractExpiryDate(rec);
      if (expiryStr) {
        const expTime = new Date(expiryStr).getTime();
        if (!isNaN(expTime)) {
          const daysRemaining = Math.ceil(
            (expTime - nowMs) / (1000 * 60 * 60 * 24)
          );
          if (daysRemaining < 0) {
            const expId = `med-exp-${rec.$id}-expired`;
            pushUnique({
              id: expId,
              kind: 'medical',
              filterCategory: 'Medical',
              categoryLabel: '⚠️ VACCINATION EXPIRED',
              title: `Expired: ${rec.medicineType} (${petName})`,
              subtitle: `Expired on ${expiryStr} (${Math.abs(
                daysRemaining
              )} day(s) ago). Please schedule a booster vaccination.`,
              timestamp:
                rec.$updatedAt ||
                rec.dateAdministered ||
                new Date().toISOString(),
              isRead: readIds.has(expId),
            });
          } else if (daysRemaining <= 30) {
            const soonId = `med-exp-${rec.$id}-soon`;
            pushUnique({
              id: soonId,
              kind: 'medical',
              filterCategory: 'Medical',
              categoryLabel: '⏳ BOOSTER DUE SOON',
              title: `Expiring in ${daysRemaining}d: ${rec.medicineType} (${petName})`,
              subtitle: `Booster due by ${expiryStr}. Tap to view pet passport & health records.`,
              timestamp:
                rec.$updatedAt ||
                rec.dateAdministered ||
                new Date().toISOString(),
              isRead: readIds.has(soonId),
            });
          }
        }
      }
    }

    if (!isOfficer) {
      // 4. Pet Match Notifications (Owner)
      for (const note of matchAlerts) {
        const itemId = `match-${note.$id}`;
        let cleanPetName = note.petName || '';
        if (cleanPetName.toLowerCase().includes('needs a new home')) {
          cleanPetName = cleanPetName
            .replace(/\s+needs\s+a\s+new\s+home/i, '')
            .trim();
        }
        pushUnique({
          id: itemId,
          kind: 'match',
          filterCategory: 'Adoptions',
          categoryLabel: '🐾 ADOPTION MATCH',
          title: note.title || `New match: ${cleanPetName || 'Companion'}`,
          subtitle: cleanPetName
            ? `Matched pet: ${cleanPetName} • Tap to view listing`
            : 'Tap to view matched adoption listing',
          timestamp: note.createdAt || new Date().toISOString(),
          isRead: Boolean(note.isRead) || readIds.has(itemId),
          matchNote: note,
        });
      }

      // 5. Incoming Adoption Applications (`listOwnListingApplications`)
      for (const app of incomingApplications) {
        const status = String(app.status || '').toUpperCase();
        if (
          status === 'PENDING' ||
          status === 'APPROVED' ||
          status === 'OWNER_APPROVED'
        ) {
          const itemId = `in-app-${app.id}-${status}`;
          pushUnique({
            id: itemId,
            kind: 'application',
            filterCategory: 'Adoptions',
            categoryLabel:
              status === 'PENDING'
                ? '📥 INCOMING APPLICATION'
                : '🤝 HANDOVER READY',
            title:
              status === 'PENDING'
                ? `Adoption Request for ${app.petName || 'Your Pet'}`
                : `Ready for Handover: ${app.petName || 'Your Pet'}`,
            subtitle: `${
              app.applicantName || 'An applicant'
            } (${status.replace('_', ' ')}) • Tap to review in Profile`,
            timestamp: app.applied_at || new Date().toISOString(),
            isRead: readIds.has(itemId),
          });
        }
      }

      // 6. Outgoing Adoption Applications (`adoption_applications`: approved, completed, rejected, submitted)
      for (const app of myApplications) {
        const rawStatus = String(app.status || 'SUBMITTED').toUpperCase();
        const normalized =
          rawStatus === 'PENDING' ? 'SUBMITTED' : rawStatus.replace('_', ' ');
        const itemId = `my-app-${app.id}-${rawStatus}`;
        pushUnique({
          id: itemId,
          kind: 'application',
          filterCategory: 'Adoptions',
          categoryLabel: '📋 MY APPLICATION',
          title: `Application ${normalized}: ${
            app.petName || app.listingTitle || 'Listed Pet'
          }`,
          subtitle: 'Tap to view your adoption application status in Profile',
          timestamp: app.applied_at || new Date().toISOString(),
          isRead: readIds.has(itemId),
        });
      }

      // 7. Pet Profile Verification Updates (`verified` | `rejected`)
      for (const pet of ownedPets) {
        if (
          pet.verificationStatus === 'verified' ||
          pet.verificationStatus === 'rejected'
        ) {
          const itemId = `pet-verif-${pet.$id}-${pet.verificationStatus}`;
          pushUnique({
            id: itemId,
            kind: 'verification',
            filterCategory: 'Alerts',
            categoryLabel:
              pet.verificationStatus === 'verified'
                ? '✅ PET VERIFIED'
                : '⚠️ PET VERIFICATION REJECTED',
            title:
              pet.verificationStatus === 'verified'
                ? `${pet.petName} is CVO Verified!`
                : `Verification Update for ${pet.petName}`,
            subtitle:
              pet.verificationStatus === 'verified'
                ? `Official Registry ID: ${
                    pet.officialRegistryId || 'Assigned'
                  } • Tap to view in Profile`
                : 'Please review your pet profile details in My Pets.',
            timestamp:
              pet.$updatedAt || pet.$createdAt || new Date().toISOString(),
            isRead: readIds.has(itemId),
          });
        }
      }

      // 8. Owner Account ID Verification Requests (`approved` | `rejected`)
      for (const req of idVerifRequests) {
        if (req.status === 'approved' || req.status === 'rejected') {
          const itemId = `id-verif-${req.$id}-${req.status}`;
          pushUnique({
            id: itemId,
            kind: 'verification',
            filterCategory: 'Alerts',
            categoryLabel:
              req.status === 'approved'
                ? '🛡️ ID VERIFICATION APPROVED'
                : '⚠️ ID VERIFICATION REJECTED',
            title:
              req.status === 'approved'
                ? 'Your CVO Pet Owner Account is Verified'
                : 'Government ID Verification Requires Attention',
            subtitle:
              req.reviewNote ||
              (req.status === 'approved'
                ? 'You now have full access to Community posting and Incident Reporting.'
                : 'Tap to review CVO feedback and upload a replacement ID in Profile.'),
            timestamp:
              (req as any).reviewedAt ||
              req.$updatedAt ||
              req.$createdAt ||
              new Date().toISOString(),
            isRead: readIds.has(itemId),
          });
        }
      }

      // 9. Ownership Transfer History (`newOwnerId` or `previousOwnerId`)
      for (const evt of ownershipEvents) {
        const itemId = `ownership-${evt.$id}`;
        const isNewOwner = String(evt.newOwnerId) === String(user?.id);
        const petLabel =
          evt.petName || petNameMap[evt.petId] || 'Companion Animal';
        pushUnique({
          id: itemId,
          kind: 'ownership',
          filterCategory: 'Adoptions',
          categoryLabel: '🔄 OWNERSHIP TRANSFER',
          title: isNewOwner
            ? `Ownership Received: ${petLabel}`
            : `Ownership Transferred: ${petLabel}`,
          subtitle: `${evt.transferType} transfer (${
            evt.previousOwnerName || 'Previous Owner'
          } → ${evt.newOwnerName || 'New Owner'})`,
          timestamp:
            evt.transferDate || evt.$createdAt || new Date().toISOString(),
          isRead: readIds.has(itemId),
        });
      }
    } else {
      // Field Officer Queue: Active Disease Alerts & Pending Disease Reports
      for (const alert of activeAlerts) {
        const itemId = `alert-${alert.id}`;
        pushUnique({
          id: itemId,
          kind: 'alert',
          filterCategory: 'Alerts',
          categoryLabel: alert.isOutbreak
            ? '🚨 OUTBREAK DECLARATION'
            : '⚠️ STAFF SURVEILLANCE ALERT',
          title: alert.title || `${alert.disease} Alert`,
          subtitle: `Brgy. ${alert.barangay} • ${
            alert.description || 'Tap to view in Staff Alerts'
          }`,
          timestamp: alert.created_at || new Date().toISOString(),
          isRead: readIds.has(itemId),
        });
      }

      for (const rep of pendingReports) {
        const itemId = `rep-pending-${rep.$id}`;
        pushUnique({
          id: itemId,
          kind: 'incident_report',
          filterCategory: 'Alerts',
          categoryLabel: '📋 PENDING INCIDENT REPORT',
          title: `Unverified ${rep.diseaseType} Report`,
          subtitle: `Brgy. ${rep.barangay || 'Iligan'} • ${
            rep.description || 'Tap to verify or reject in Field Incidents'
          }`,
          timestamp:
            rep.reportedAt || rep.$createdAt || new Date().toISOString(),
          isRead: readIds.has(itemId),
        });
      }
    }

    return list.sort((a, b) =>
      String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    );
  }, [
    isOfficer,
    communityNotifs,
    cvoNotices,
    medicalRecords,
    petNameMap,
    matchAlerts,
    incomingApplications,
    myApplications,
    ownedPets,
    idVerifRequests,
    ownershipEvents,
    activeAlerts,
    pendingReports,
    readIds,
    user?.id,
  ]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    if (selectedFilter === 'All') return items;
    if (selectedFilter === 'Unread') return items.filter((i) => !i.isRead);
    return items.filter((i) => i.filterCategory === selectedFilter);
  }, [items, selectedFilter]);

  const filterCounts = useMemo(() => {
    return {
      All: items.length,
      Unread: items.filter((i) => !i.isRead).length,
      Community: items.filter((i) => i.filterCategory === 'Community').length,
      Adoptions: items.filter((i) => i.filterCategory === 'Adoptions').length,
      Medical: items.filter((i) => i.filterCategory === 'Medical').length,
      Alerts: items.filter((i) => i.filterCategory === 'Alerts').length,
    };
  }, [items]);

  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const handleMarkAllAsRead = async () => {
    if (isMarkingAllRead || unreadCount === 0) return;
    setIsMarkingAllRead(true);
    const next = new Set<string>(readIds);
    for (const item of items) {
      next.add(item.id);
    }
    setReadIds(next);

    try {
      await persistReadIds(next);

      if (!isOfficer) {
        const unreadMatches = matchAlerts.filter((m) => !m.isRead);
        if (unreadMatches.length > 0) {
          setMatchAlerts((prev) => prev.map((m) => ({ ...m, isRead: true })));
          await Promise.all(
            unreadMatches.map((m) =>
              readMatchNotification(m.$id).catch(() => {})
            )
          );
        }
      }
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleMarkItemAsRead = async (
    item: UnifiedNotificationItem,
    e?: any
  ) => {
    e?.stopPropagation?.();
    const next = new Set<string>(readIds);
    next.add(item.id);
    setReadIds(next);
    await persistReadIds(next);

    if (item.kind === 'match' && item.matchNote && !item.matchNote.isRead) {
      setMatchAlerts((prev) =>
        prev.map((m) =>
          m.$id === item.matchNote!.$id ? { ...m, isRead: true } : m
        )
      );
      readMatchNotification(item.matchNote.$id).catch(() => {});
    }
  };

  const handlePressItem = async (item: UnifiedNotificationItem) => {
    const next = new Set<string>(readIds);
    next.add(item.id);
    await persistReadIds(next);

    // 1. Adoption Match -> mark read & open PetDetail / AdoptionFeed
    if (item.kind === 'match' && item.matchNote) {
      const note = item.matchNote;
      if (!note.isRead) {
        setMatchAlerts((prev) =>
          prev.map((m) => (m.$id === note.$id ? { ...m, isRead: true } : m))
        );
        readMatchNotification(note.$id).catch(() => {});
      }
      setVisible(false);

      const targetListingId = String(note.listingId || '');
      let matched = useAdoptionStore
        .getState()
        .availablePets.find(
          (p) => String(p.listingId || p.id) === targetListingId
        );
      if (!matched) {
        await useAdoptionStore.getState().fetchAvailablePets();
        matched = useAdoptionStore
          .getState()
          .availablePets.find(
            (p) => String(p.listingId || p.id) === targetListingId
          );
      }

      const detailParams = matched
        ? buildPetDetailPayload(matched, user?.id)
        : null;
      if (detailParams) {
        navigation.navigate('PetDetail', detailParams);
      } else {
        navigation.navigate('AdoptionFeed');
      }
      return;
    }

    setVisible(false);

    // 2. Officer Pending Incident Reports -> FieldIncidents
    if (item.kind === 'incident_report') {
      navigation.navigate('FieldIncidents');
      return;
    }

    // 3. Community items (or CVO notices for owners) -> Community with deep-link params
    if (
      item.kind === 'community' ||
      item.channelId ||
      item.postId ||
      (item.kind === 'notice' && !isOfficer)
    ) {
      navigation.navigate('Community', {
        channelId: item.channelId,
        postId: item.postId,
        tab:
          item.communityTab ||
          (item.channelId || item.postId ? 'feed' : 'notices'),
      });
      return;
    }

    // 4. Officer Outbreak Alerts / Notices -> OcularQueue
    if (item.kind === 'alert' || (item.kind === 'notice' && isOfficer)) {
      if (isOfficer) {
        navigation.navigate('OcularQueue');
      } else {
        navigation.navigate('Community', { tab: 'notices' });
      }
      return;
    }

    // 5. Applications, Pet Verification, ID Verification, Medical, Ownership Transfers -> UserProfile (or FieldLookup for officers)
    if (
      item.kind === 'application' ||
      item.kind === 'verification' ||
      item.kind === 'medical' ||
      item.kind === 'ownership'
    ) {
      if (isOfficer) {
        navigation.navigate('FieldLookup');
      } else {
        const targetTab =
          item.kind === 'application'
            ? 'applications'
            : item.kind === 'verification'
            ? 'verification'
            : 'pets';
        navigation.navigate('UserProfile', { tab: targetTab });
      }
    }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        style={styles.bellButton}
        onPress={handleOpenModal}
        activeOpacity={0.75}
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle={
          Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'
        }
        onRequestClose={() => setVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(14, insets.top),
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Notification Center</Text>
              <Text style={styles.modalSub}>
                {unreadCount > 0
                  ? `${unreadCount} unread notification(s)`
                  : 'All notifications read'}
              </Text>
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.markReadBtn,
                    isMarkingAllRead && { opacity: 0.6 },
                  ]}
                  onPress={handleMarkAllAsRead}
                  disabled={isMarkingAllRead}
                  activeOpacity={0.75}
                >
                  <Text style={styles.markReadText}>
                    {isMarkingAllRead ? 'Marking read...' : 'Mark all as read'}
                  </Text>
                </TouchableOpacity>
              ) : items.length > 0 ? (
                <View style={styles.allReadBadge}>
                  <Text style={styles.allReadText}>✓ All read</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setVisible(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category Filter Pills */}
          <View style={styles.filterBarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
            >
              {FILTER_CATEGORIES.map((cat) => {
                const isActive = selectedFilter === cat;
                const count = filterCounts[cat] || 0;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                    onPress={() => setSelectedFilter(cat)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {cat}
                      {count > 0 ? ` (${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {isLoading && items.length === 0 ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading}
                  onRefresh={refreshNotifications}
                />
              }
              ListEmptyComponent={() => {
                const emptyMeta = getCategoryEmptyState(selectedFilter);
                return (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyEmoji}>{emptyMeta.emoji}</Text>
                    <Text style={styles.emptyTitle}>{emptyMeta.title}</Text>
                    <Text style={styles.emptySub}>{emptyMeta.subtitle}</Text>
                  </View>
                );
              }}
              renderItem={({ item }) => {
                const tagMeta = getCategoryTagStyle(item.filterCategory);
                return (
                  <TouchableOpacity
                    style={[
                      styles.card,
                      !item.isRead && [
                        styles.cardUnread,
                        { borderLeftColor: tagMeta.accentBorder },
                      ],
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handlePressItem(item)}
                  >
                    <View style={styles.cardHeaderRow}>
                      <View
                        style={[
                          styles.categoryBadge,
                          {
                            backgroundColor: tagMeta.bg,
                            borderColor: tagMeta.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryLabel,
                            { color: tagMeta.text },
                          ]}
                        >
                          {item.categoryLabel}
                        </Text>
                      </View>
                      <View style={styles.statusRow}>
                        {!item.isRead ? (
                          <TouchableOpacity
                            style={styles.inlineMarkReadBtn}
                            onPress={(e) => handleMarkItemAsRead(item, e)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Mark notification as read"
                          >
                            <View style={styles.unreadDot} />
                            <Text style={styles.inlineMarkReadText}>
                              Mark read
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <Text style={styles.timeText}>
                          {formatRelativeTime(item.timestamp)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.cardTitle,
                        !item.isRead && styles.cardTitleUnread,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={3}>
                      {item.subtitle}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const baseStyles = StyleSheet.create({
  bellButton: {
    position: 'relative',
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markReadBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  markReadText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '700',
  },
  allReadBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  allReadText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  filterBarContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#00AEEF',
    borderColor: '#00AEEF',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 36,
  },
  emptyBox: {
    marginTop: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#00AEEF',
    backgroundColor: '#F8FAFF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineMarkReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  inlineMarkReadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  timeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardTitleUnread: {
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
});
