import { useAppPalette, useThemedStyles } from '../../theme';
import React, {
  ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useLiveSync } from '../../utils/useLiveSync';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import {
  getMediaFileUrl,
  getOwnedImageUri,
  operate,
  uploadMediaFile,
} from '../../api/client';
import { useAuthStore } from '../../store';
import {
  ChannelJoinRequest,
  CommunityChannel,
  CommunityComment,
  CommunityNotice,
  CommunityOverview,
  CommunityPost,
  CommunityPrivacy,
  NoticeCategory,
} from '../../store/types/adoption';

type DraftPostImage = {
  asset: ImagePicker.ImagePickerAsset;
  uploadedFileId?: string;
};

type ReplyTarget = {
  id: string;
  authorName: string;
  snippet: string;
};

/** Safely normalizes `imageFileIds` whether the backend returns an array or a JSON string */
function parseImageFileIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => String(x || '').trim()).filter(Boolean);
        }
      } catch {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

/** Applies an optimistic vote toggle (+1 / -1) to a post or comment item */
function applyOptimisticVote<
  T extends { upvotes?: number; downvotes?: number; score?: number; myVote?: number },
>(item: T, clickedValue: 1 | -1): T {
  const prevVote = Number(item.myVote || 0);
  const nextVote = prevVote === clickedValue ? 0 : clickedValue;
  const upDelta = (nextVote === 1 ? 1 : 0) - (prevVote === 1 ? 1 : 0);
  const downDelta = (nextVote === -1 ? 1 : 0) - (prevVote === -1 ? 1 : 0);
  return {
    ...item,
    myVote: nextVote as -1 | 0 | 1,
    upvotes: Math.max(0, Number(item.upvotes || 0) + upDelta),
    downvotes: Math.max(0, Number(item.downvotes || 0) + downDelta),
    score: Number(item.score || 0) + (nextVote - prevVote),
  };
}

/**
 * Resolves a 5-minute signed URL from `communityImageToken`, with fallback to
 * authenticated SDK binary download (`getOwnedImageUri`) if token view requires session headers.
 */
function SignedCommunityImage({
  postId,
  fileId,
  index,
  total,
  styles,
  accentColor,
  secondaryColor,
  onPreview,
}: {
  postId: string;
  fileId: string;
  index: number;
  total: number;
  styles: any;
  accentColor: string;
  secondaryColor: string;
  onPreview?: (uri: string) => void;
}) {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setFailed(false);
    setResolvedUri(null);

    (async () => {
      try {
        const res = await operate<{ url?: string; viewUrl?: string }>(
          'communityImageToken',
          { postId, fileId }
        );
        const tokenUrl = res?.url || res?.viewUrl;
        if (mountedRef.current && tokenUrl) {
          setResolvedUri(tokenUrl);
          return;
        }
      } catch {
        // Fallback below if token action fails
      }

      const localUri = await getOwnedImageUri(fileId);
      if (mountedRef.current && localUri) {
        setResolvedUri(localUri);
        return;
      }

      const directUrl = getMediaFileUrl(fileId);
      if (mountedRef.current && directUrl) {
        setResolvedUri(directUrl);
      } else if (mountedRef.current) {
        setFailed(true);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [postId, fileId, retrySeed]);

  if (failed) {
    return (
      <TouchableOpacity
        style={styles.imageTokenPlaceholder}
        onPress={() => setRetrySeed((s) => s + 1)}
        activeOpacity={0.75}
      >
        <Text
          style={{
            fontSize: 11,
            color: secondaryColor,
            textAlign: 'center',
            fontWeight: '600',
          }}
        >
          Image unavailable{'\n'}Tap to retry
        </Text>
      </TouchableOpacity>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={styles.imageTokenPlaceholder}>
        <ActivityIndicator size="small" color={accentColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPreview?.(resolvedUri)}
      style={styles.postImageTouchWrap}
    >
      <Image
        source={{ uri: resolvedUri }}
        style={styles.postAttachedImage}
        resizeMode="cover"
        onError={async () => {
          const backup = await getOwnedImageUri(fileId);
          if (!mountedRef.current) return;
          if (backup && backup !== resolvedUri) {
            setResolvedUri(backup);
          } else {
            setFailed(true);
          }
        }}
      />
      {total > 1 && (
        <View style={styles.imageCounterBadge}>
          <Text style={styles.imageCounterText}>
            {index + 1}/{total}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Checks whether a post or comment author is a Field Officer or CVO staff member */
function isOfficialStaffAuthor(
  item: {
    authorId?: string;
    authorName?: string;
    authorRole?: string;
    accountType?: string;
    role?: string;
    isOfficial?: boolean;
  },
  currentUserId?: string,
  currentUserIsOfficer?: boolean
): boolean {
  if (item.isOfficial) return true;
  const roleCandidates = [
    item.authorRole,
    item.accountType,
    item.role,
    (item as any).authorAccountType,
    (item as any).contractRole,
    (item as any).userRole,
  ];
  for (const candidate of roleCandidates) {
    if (
      typeof candidate === 'string' &&
      /^(officer|field_officer|staff|admin|cvo|vet_officer|cvo_admin)$/i.test(
        candidate.trim()
      )
    ) {
      return true;
    }
  }
  if (
    currentUserIsOfficer &&
    currentUserId &&
    item.authorId &&
    String(item.authorId) === String(currentUserId)
  ) {
    return true;
  }
  if (
    typeof item.authorName === 'string' &&
    /\b(cvo|field officer|vet officer)\b/i.test(item.authorName)
  ) {
    return true;
  }
  return false;
}

export default function CommunityScreen() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const isDark = useAuthStore((s) => s.user?.theme === 'dark');
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const semantic = useMemo(
    () => ({
      dangerBg: isDark ? '#3F1D24' : '#FEE2E2',
      dangerBorder: isDark ? '#7F1D1D' : '#FCA5A5',
      successText: isDark ? '#4ADE80' : '#15803D',
      successBg: isDark ? '#143322' : '#DCFCE7',
      successBorder: isDark ? '#166534' : '#86EFAC',
      warningText: isDark ? '#FCD34D' : '#92400E',
      warningAccent: isDark ? '#FBBF24' : '#B45309',
      warningBg: isDark ? '#33250B' : '#FEF3C7',
      warningBorder: isDark ? '#92400E' : '#F59E0B',
      bannerBg: isDark ? '#172438' : '#1E293B',
      bannerSub: isDark ? '#ABBBD0' : '#CBD5E1',
    }),
    [isDark]
  );

  const [overviewRole, setOverviewRole] = useState<
    'owner' | 'officer' | 'admin' | null
  >(null);
  const [overviewVerified, setOverviewVerified] = useState(false);

  const isOfficer =
    user?.contractRole === 'officer' ||
    user?.role === 'VET_OFFICER' ||
    user?.role === 'CVO_ADMIN' ||
    overviewRole === 'officer' ||
    overviewRole === 'admin';

  const isVerifiedOwner =
    isOfficer ||
    user?.accountVerificationStatus === 'verified' ||
    Boolean(user?.isVerified) ||
    overviewVerified;

  const [activeTab, setActiveTab] = useState<'feed' | 'channels' | 'notices'>(
    'feed'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Overview state
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [notices, setNotices] = useState<CommunityNotice[]>([]);
  const [noticeFilter, setNoticeFilter] = useState<'all' | NoticeCategory>(
    'all'
  );
  const [selectedChannel, setSelectedChannel] =
    useState<CommunityChannel | null>(null);
  const selectedChannelRef = useRef<CommunityChannel | null>(null);
  selectedChannelRef.current = selectedChannel;
  const [channelPosts, setChannelPosts] = useState<CommunityPost[]>([]);
  const hasLoadedOnceRef = useRef(false);
  const channelReqSeqRef = useRef(0);

  // Search state (`communitySearch`) — keep searchChannels separate from full directory!
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [searchPosts, setSearchPosts] = useState<CommunityPost[] | null>(null);
  const [searchChannels, setSearchChannels] = useState<
    CommunityChannel[] | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);

  // Per-action loading / double-submit guards
  const [votingTargets, setVotingTargets] = useState<Record<string, boolean>>(
    {}
  );
  const [busyChannelActionId, setBusyChannelActionId] = useState<string | null>(
    null
  );
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null
  );
  const [reviewingReqId, setReviewingReqId] = useState<string | null>(null);

  // Create Channel Modal (`communityCreateChannel`)
  const [isCreateChannelVisible, setIsCreateChannelVisible] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelPrivacy, setNewChannelPrivacy] =
    useState<CommunityPrivacy>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Post Modal (`communityCreatePost` with <= 4 private images)
  const [isCreatePostVisible, setIsCreatePostVisible] = useState(false);
  const [postKind, setPostKind] = useState<'discussion' | 'announcement'>(
    'discussion'
  );
  const [postTargetChannelId, setPostTargetChannelId] = useState<string>('');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postImages, setPostImages] = useState<DraftPostImage[]>([]);

  // Post Comments & Replies Modal (`communityComments`, `communityCreateComment`)
  const [activePostForComments, setActivePostForComments] =
    useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [replyToComment, setReplyToComment] = useState<ReplyTarget | null>(
    null
  );
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const commentsScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const commentInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Channel Creator Join Requests Modal (`communityJoinRequests`, `communityReviewJoin`)
  const [isJoinReqModalVisible, setIsJoinReqModalVisible] = useState(false);
  const [joinReqChannel, setJoinReqChannel] = useState<CommunityChannel | null>(
    null
  );
  const [joinRequests, setJoinRequests] = useState<ChannelJoinRequest[]>([]);

  // Fullscreen image viewer
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const normalizePosts = (rawPosts: any[]): CommunityPost[] => {
    if (!Array.isArray(rawPosts)) return [];
    return rawPosts.map((p) => ({
      ...p,
      id: String(p.id || p.$id || ''),
      authorRole: p.authorRole || p.role || p.accountType || undefined,
      accountType: p.accountType || p.authorRole || p.role || undefined,
      isOfficial: Boolean(p.isOfficial),
      imageFileIds: parseImageFileIds(p.imageFileIds),
    }));
  };

  const writableChannels = useMemo(
    () =>
      channels.filter(
        (c) => c.canRead || c.privacy === 'public' || isOfficer
      ),
    [channels, isOfficer]
  );

  const loadChannelPosts = useCallback(
    async (channel: CommunityChannel, silent = false) => {
      const reqId = ++channelReqSeqRef.current;
      setSelectedChannel(channel);
      setPostsError(null);
      if (!channel.canRead && channel.privacy === 'private' && !isOfficer) {
        setChannelPosts([]);
        setIsLoadingPosts(false);
        return;
      }
      if (!silent) {
        setIsLoadingPosts(true);
      }
      try {
        const res = await operate<{
          channel?: CommunityChannel;
          posts?: CommunityPost[];
        }>('communityChannel', { channelId: channel.id });
        if (channelReqSeqRef.current !== reqId) return;
        setChannelPosts(normalizePosts(res?.posts || []));
      } catch (error: any) {
        if (channelReqSeqRef.current !== reqId) return;
        console.warn('communityChannel warning:', error);
        if (!silent) {
          setPostsError(
            error?.message || 'Could not load discussions for this channel.'
          );
          setChannelPosts([]);
        }
      } finally {
        if (channelReqSeqRef.current === reqId && !silent) {
          setIsLoadingPosts(false);
        }
      }
    },
    [isOfficer]
  );

  const openCommentsModal = useCallback(
    async (post: CommunityPost, silent = false) => {
      const isDifferentPost = activePostForComments?.id !== post.id;
      setActivePostForComments(post);
      if (!silent) {
        setReplyToComment(null);
        setCommentsError(null);
        setLoadingComments(true);
        if (isDifferentPost) {
          setNewCommentBody('');
          setComments([]);
        }
      }
      try {
        const res = await operate<{
          post?: CommunityPost;
          comments?: CommunityComment[];
        }>('communityComments', { postId: post.id });
        const rawComments = Array.isArray(res?.comments) ? res.comments : [];
        setComments(
          rawComments.map((c: any) => ({
            ...c,
            id: String(c.id || c.$id || ''),
            authorRole: c.authorRole || c.role || c.accountType || undefined,
            accountType: c.accountType || c.authorRole || c.role || undefined,
            isOfficial: Boolean(c.isOfficial),
          }))
        );
        if (res?.post) {
          setActivePostForComments((prev) =>
            prev && prev.id === post.id ? { ...prev, ...res.post } : prev
          );
        }
      } catch (err: any) {
        if (!silent) {
          setCommentsError(err?.message || 'Could not load comments.');
          setComments([]);
        }
      } finally {
        if (!silent) setLoadingComments(false);
      }
    },
    [activePostForComments?.id]
  );

  const fetchCommunityData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
        setFeedError(null);
      }
      try {
        const [overviewRes, noticesRes] = await Promise.all([
          operate<CommunityOverview>('communityOverview', {}),
          operate<{ notices?: CommunityNotice[] }>(
            'communityOfficialNotices',
            {}
          ).catch(() => ({ notices: [] })),
        ]);

        if (overviewRes?.role) {
          setOverviewRole(overviewRes.role);
        }
        if (typeof overviewRes?.verified === 'boolean') {
          setOverviewVerified(overviewRes.verified);
        }

        const fetchedChannels = Array.isArray(overviewRes?.channels)
          ? overviewRes.channels
          : [];
        setChannels(fetchedChannels);

        const mergedNotices =
          Array.isArray(noticesRes?.notices) && noticesRes.notices.length > 0
            ? noticesRes.notices
            : Array.isArray(overviewRes?.notices)
            ? overviewRes.notices
            : [];
        setNotices(mergedNotices);

        const requestedChannelId = route?.params?.channelId
          ? String(route.params.channelId)
          : '';
        const requestedPostId = route?.params?.postId
          ? String(route.params.postId)
          : '';
        const requestedTab = route?.params?.tab as
          | 'feed'
          | 'channels'
          | 'notices'
          | undefined;

        if (!silent) {
          if (requestedTab) {
            setActiveTab(requestedTab);
          } else if (requestedChannelId || requestedPostId) {
            setActiveTab('feed');
          }
        }

        const currentSelected = selectedChannelRef.current;
        let channelToLoad: CommunityChannel | undefined;

        if (!silent && requestedChannelId) {
          channelToLoad = fetchedChannels.find(
            (c) => String(c.id) === requestedChannelId
          );
        }
        if (!channelToLoad && currentSelected) {
          channelToLoad = fetchedChannels.find(
            (c) => c.id === currentSelected.id
          );
        }
        if (!channelToLoad) {
          channelToLoad =
            fetchedChannels.find((c) => c.privacy === 'public' || c.canRead) ||
            fetchedChannels[0];
        }

        if (channelToLoad) {
          const reqId = ++channelReqSeqRef.current;
          setSelectedChannel(channelToLoad);
          setPostsError(null);
          if (
            !channelToLoad.canRead &&
            channelToLoad.privacy === 'private' &&
            !isOfficer
          ) {
            setChannelPosts([]);
          } else {
            try {
              const res = await operate<{
                channel?: CommunityChannel;
                posts?: CommunityPost[];
              }>('communityChannel', { channelId: channelToLoad.id });
              if (channelReqSeqRef.current === reqId) {
                const posts = normalizePosts(res?.posts || []);
                setChannelPosts(posts);
                if (!silent && requestedPostId) {
                  const targetPost = posts.find(
                    (p) => String(p.id) === requestedPostId
                  );
                  if (targetPost) {
                    openCommentsModal(targetPost);
                  }
                }
              }
            } catch (error: any) {
              console.warn('communityChannel warning:', error);
              if (channelReqSeqRef.current === reqId && !silent) {
                setPostsError(
                  error?.message || 'Could not load channel discussions.'
                );
                setChannelPosts([]);
              }
            }
          }
        } else {
          setSelectedChannel(null);
          setChannelPosts([]);
        }
        hasLoadedOnceRef.current = true;
      } catch (error: any) {
        console.warn('communityOverview error:', error);
        if (!silent) {
          setFeedError(error?.message || 'Could not connect to Community Hub.');
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [
      isOfficer,
      openCommentsModal,
      route?.params?.channelId,
      route?.params?.postId,
      route?.params?.tab,
    ]
  );

  useEffect(() => {
    if (
      route?.params?.channelId ||
      route?.params?.postId ||
      route?.params?.tab
    ) {
      fetchCommunityData(false);
    }
  }, [
    route?.params?.channelId,
    route?.params?.postId,
    route?.params?.tab,
    fetchCommunityData,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchCommunityData(hasLoadedOnceRef.current);
    }, [fetchCommunityData])
  );

  useLiveSync(
    () => {
      fetchCommunityData(true);
      if (activePostForComments) {
        openCommentsModal(activePostForComments, true);
      }
    },
    {
      enabled:
        !isCreateChannelVisible &&
        !isCreatePostVisible &&
        !isJoinReqModalVisible &&
        !previewImageUri,
    }
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setActiveSearchTerm('');
    setSearchPosts(null);
    setSearchChannels(null);
    Keyboard.dismiss();
  }, []);

  const handleSearch = async (termOverride?: string) => {
    const q = (typeof termOverride === 'string' ? termOverride : searchQuery).trim();
    if (q.length < 2) {
      setActiveSearchTerm('');
      setSearchPosts(null);
      setSearchChannels(null);
      if (q.length > 0) {
        Alert.alert('Search Tip', 'Enter at least 2 characters to search.');
      }
      return;
    }
    Keyboard.dismiss();
    setIsSearching(true);
    try {
      const res = await operate<{
        channels?: CommunityChannel[];
        posts?: CommunityPost[];
      }>('communitySearch', { query: q.slice(0, 80) });
      setActiveSearchTerm(q);
      setSearchChannels(Array.isArray(res?.channels) ? res.channels : []);
      setSearchPosts(normalizePosts(res?.posts || []));
    } catch (error: any) {
      Alert.alert('Search Error', error?.message || 'Could not search.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRefresh = async () => {
    await fetchCommunityData(false);
    if (activeSearchTerm.length >= 2) {
      await handleSearch(activeSearchTerm);
    }
  };

  const resetCreateChannelModal = () => {
    if (isSubmitting) return;
    setIsCreateChannelVisible(false);
    setNewChannelName('');
    setNewChannelDesc('');
    setNewChannelPrivacy('public');
  };

  const handleCreateChannel = async () => {
    if (!isVerifiedOwner) {
      Alert.alert(
        'Verified Pet Owner Required',
        'Only CVO-Verified Pet Owners can create community channels.'
      );
      return;
    }
    if (!newChannelName.trim()) {
      Alert.alert('Required', 'Please enter a channel name (1–80 chars).');
      return;
    }

    setIsSubmitting(true);
    try {
      await operate('communityCreateChannel', {
        name: newChannelName.trim(),
        description: newChannelDesc.trim(),
        privacy: newChannelPrivacy,
      });
      setIsCreateChannelVisible(false);
      setNewChannelName('');
      setNewChannelDesc('');
      setNewChannelPrivacy('public');
      await fetchCommunityData(false);
      Alert.alert('Channel Created', 'Your new channel is now live!');
    } catch (error: any) {
      Alert.alert(
        'Channel Creation Failed',
        error?.message || 'Could not create channel.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleChannelPrivacy = async (channel: CommunityChannel) => {
    if (busyChannelActionId) return;
    const nextPrivacy: CommunityPrivacy =
      channel.privacy === 'public' ? 'private' : 'public';
    setBusyChannelActionId(channel.id);
    try {
      await operate('communitySetPrivacy', {
        channelId: channel.id,
        privacy: nextPrivacy,
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id ? { ...c, privacy: nextPrivacy } : c
        )
      );
      setSearchChannels((prev) =>
        prev
          ? prev.map((c) =>
              c.id === channel.id ? { ...c, privacy: nextPrivacy } : c
            )
          : null
      );
      if (selectedChannel?.id === channel.id) {
        setSelectedChannel((prev) =>
          prev ? { ...prev, privacy: nextPrivacy } : prev
        );
      }
      await fetchCommunityData(true);
      Alert.alert(
        'Privacy Updated',
        `Channel is now ${nextPrivacy.toUpperCase()}.`
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not change privacy.');
    } finally {
      setBusyChannelActionId(null);
    }
  };

  const handleDeleteChannel = (channel: CommunityChannel) => {
    if (busyChannelActionId) return;
    Alert.alert(
      'Delete Channel?',
      `Are you sure you want to delete "#${channel.name}" and all of its discussions?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Channel',
          style: 'destructive',
          onPress: async () => {
            setBusyChannelActionId(channel.id);
            try {
              await operate('communityDeleteChannel', {
                channelId: channel.id,
              });
              setSelectedChannel(null);
              selectedChannelRef.current = null;
              await fetchCommunityData(false);
              Alert.alert(
                'Channel Deleted',
                `"#${channel.name}" has been deleted.`
              );
            } catch (error: any) {
              Alert.alert(
                'Error',
                error?.message || 'Could not delete channel.'
              );
            } finally {
              setBusyChannelActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleRequestJoinPrivate = async (channel: CommunityChannel) => {
    if (busyChannelActionId) return;
    setBusyChannelActionId(channel.id);
    try {
      await operate('communityRequestJoin', { channelId: channel.id });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id ? { ...c, membership: 'pending' } : c
        )
      );
      setSearchChannels((prev) =>
        prev
          ? prev.map((c) =>
              c.id === channel.id ? { ...c, membership: 'pending' } : c
            )
          : null
      );
      if (selectedChannel?.id === channel.id) {
        setSelectedChannel((prev) =>
          prev ? { ...prev, membership: 'pending' } : prev
        );
      }
      await fetchCommunityData(true);
      Alert.alert(
        'Join Request Sent',
        `Your request to join "${channel.name}" is pending approval by the channel creator.`
      );
    } catch (error: any) {
      Alert.alert(
        'Request Failed',
        error?.message || 'Could not request membership.'
      );
    } finally {
      setBusyChannelActionId(null);
    }
  };

  const handleOpenJoinRequests = async (channel: CommunityChannel) => {
    if (busyChannelActionId) return;
    setBusyChannelActionId(channel.id);
    try {
      const res = await operate<{ requests?: ChannelJoinRequest[] }>(
        'communityJoinRequests',
        { channelId: channel.id }
      );
      setJoinReqChannel(channel);
      setJoinRequests(Array.isArray(res?.requests) ? res.requests : []);
      setIsJoinReqModalVisible(true);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'Could not load channel join requests.'
      );
    } finally {
      setBusyChannelActionId(null);
    }
  };

  const handleReviewJoinRequest = async (
    membershipId: string,
    status: 'approved' | 'rejected'
  ) => {
    const targetChannel = joinReqChannel || selectedChannel;
    if (!targetChannel || reviewingReqId) return;
    setReviewingReqId(membershipId);
    try {
      await operate('communityReviewJoin', {
        channelId: targetChannel.id,
        membershipId,
        status,
      });
      setJoinRequests((prev) => prev.filter((r) => r.id !== membershipId));
      Alert.alert('Updated', `Membership request ${status}.`);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not review join request.');
    } finally {
      setReviewingReqId(null);
    }
  };

  const openCreatePostModal = (kind: 'discussion' | 'announcement') => {
    const fallbackChannel =
      (selectedChannel &&
      (selectedChannel.canRead ||
        selectedChannel.privacy === 'public' ||
        isOfficer)
        ? selectedChannel
        : writableChannels[0]) || null;
    setPostKind(kind);
    setPostTargetChannelId(fallbackChannel?.id || '');
    setIsCreatePostVisible(true);
  };

  const resetCreatePostModal = () => {
    if (isSubmitting) return;
    setIsCreatePostVisible(false);
    setPostKind('discussion');
    setPostTitle('');
    setPostBody('');
    setPostImages([]);
  };

  const handlePickPostImage = async () => {
    if (postImages.length >= 4) {
      Alert.alert('Limit Reached', 'You can attach up to 4 images per post.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPostImages((prev) =>
        [...prev, { asset: result.assets[0] }].slice(0, 4)
      );
    }
  };

  const handleCreatePost = async () => {
    if (!isVerifiedOwner) {
      Alert.alert(
        'Verified Account Required',
        'Only CVO-Verified Pet Owners and Field Officers can publish posts.'
      );
      return;
    }
    const targetChannel =
      writableChannels.find((c) => c.id === postTargetChannelId) ||
      selectedChannel ||
      writableChannels[0] ||
      null;
    if (!targetChannel) {
      Alert.alert('Select a Channel', 'Please choose a channel first.');
      return;
    }
    if (!postTitle.trim() || !postBody.trim()) {
      Alert.alert('Missing Fields', 'Please enter a post title and message.');
      return;
    }

    const isOfficialPost = isOfficer && postKind === 'announcement';
    const cleanTitle = postTitle.trim();
    const formattedTitle =
      isOfficialPost && !/^\[?(official|cvo)/i.test(cleanTitle)
        ? `[Official Announcement] ${cleanTitle}`
        : cleanTitle;

    setIsSubmitting(true);
    const updatedDrafts = [...postImages];
    try {
      const uploadedIds: string[] = [];
      for (let i = 0; i < updatedDrafts.length; i++) {
        if (!updatedDrafts[i].uploadedFileId) {
          const fid = await uploadMediaFile(updatedDrafts[i].asset);
          updatedDrafts[i] = { ...updatedDrafts[i], uploadedFileId: fid };
        }
        uploadedIds.push(updatedDrafts[i].uploadedFileId!);
      }

      await operate('communityCreatePost', {
        channelId: targetChannel.id,
        title: formattedTitle,
        body: postBody.trim(),
        imageFileIds: uploadedIds,
        authorRole: isOfficer ? 'officer' : 'owner',
        accountType: isOfficer ? 'officer' : 'owner',
        isOfficial: isOfficialPost,
      });

      setIsCreatePostVisible(false);
      setPostKind('discussion');
      setPostTitle('');
      setPostBody('');
      setPostImages([]);
      if (activeSearchTerm) {
        clearSearch();
      }
      setActiveTab('feed');
      await loadChannelPosts(targetChannel, false);
      Alert.alert(
        'Published',
        isOfficialPost
          ? `Your official announcement post was published in #${targetChannel.name}.`
          : `Your discussion post was published in #${targetChannel.name}.`
      );
    } catch (error: any) {
      // Preserve any already-uploaded file IDs so retry doesn't duplicate uploads
      setPostImages(updatedDrafts);
      Alert.alert('Post Failed', error?.message || 'Could not publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    if (deletingPostId) return;
    Alert.alert(
      'Delete Post?',
      'Are you sure you want to delete your discussion post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const prevChannelPosts = channelPosts;
            const prevSearchPosts = searchPosts;
            setDeletingPostId(postId);
            // Optimistically remove from both channel feed and active search results
            setChannelPosts((prev) => prev.filter((p) => p.id !== postId));
            setSearchPosts((prev) =>
              prev ? prev.filter((p) => p.id !== postId) : null
            );
            try {
              await operate('communityDeletePost', { postId });
              if (selectedChannel) await loadChannelPosts(selectedChannel, true);
            } catch (error: any) {
              setChannelPosts(prevChannelPosts);
              setSearchPosts(prevSearchPosts);
              Alert.alert('Error', error?.message || 'Could not delete post.');
            } finally {
              setDeletingPostId(null);
            }
          },
        },
      ]
    );
  };

  const handleVote = async (
    targetType: 'post' | 'comment',
    targetId: string,
    value: 1 | -1
  ) => {
    if (!isVerifiedOwner) {
      Alert.alert(
        'Verified Owner Only',
        'Verify your account in Profile > ID Verify to upvote or downvote.'
      );
      return;
    }
    const key = `${targetType}:${targetId}`;
    if (votingTargets[key]) return;
    setVotingTargets((prev) => ({ ...prev, [key]: true }));

    // Snapshot for rollback on error
    const prevChannelPosts = channelPosts;
    const prevSearchPosts = searchPosts;
    const prevComments = comments;

    if (targetType === 'post') {
      setChannelPosts((prev) =>
        prev.map((p) => (p.id === targetId ? applyOptimisticVote(p, value) : p))
      );
      setSearchPosts((prev) =>
        prev
          ? prev.map((p) =>
              p.id === targetId ? applyOptimisticVote(p, value) : p
            )
          : null
      );
    } else {
      setComments((prev) =>
        prev.map((c) => (c.id === targetId ? applyOptimisticVote(c, value) : c))
      );
    }

    try {
      await operate('communityVote', { targetType, targetId, value });
      if (targetType === 'post' && selectedChannel) {
        loadChannelPosts(selectedChannel, true);
      } else if (targetType === 'comment' && activePostForComments) {
        openCommentsModal(activePostForComments, true);
      }
    } catch (error: any) {
      setChannelPosts(prevChannelPosts);
      setSearchPosts(prevSearchPosts);
      setComments(prevComments);
      Alert.alert('Vote Error', error?.message || 'Could not submit vote.');
    } finally {
      setVotingTargets((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleAddComment = async () => {
    if (!isVerifiedOwner) {
      Alert.alert(
        'Verified Account Required',
        'Only CVO-Verified Pet Owners and Field Officers can comment.'
      );
      return;
    }
    if (!activePostForComments || !newCommentBody.trim() || isSubmitting) return;

    const targetPost = activePostForComments;
    const bodyText = newCommentBody.trim();
    const isTopLevelReply = !replyToComment;

    setIsSubmitting(true);
    try {
      await operate('communityCreateComment', {
        postId: targetPost.id,
        body: bodyText,
        authorRole: isOfficer ? 'officer' : 'owner',
        accountType: isOfficer ? 'officer' : 'owner',
        ...(replyToComment ? { parentCommentId: replyToComment.id } : {}),
      });
      setNewCommentBody('');
      setReplyToComment(null);
      Keyboard.dismiss();

      setChannelPosts((prev) =>
        prev.map((p) =>
          p.id === targetPost.id
            ? { ...p, commentCount: Number(p.commentCount || 0) + 1 }
            : p
        )
      );
      setSearchPosts((prev) =>
        prev
          ? prev.map((p) =>
              p.id === targetPost.id
                ? { ...p, commentCount: Number(p.commentCount || 0) + 1 }
                : p
            )
          : null
      );

      await openCommentsModal(targetPost, true);
      if (selectedChannel) loadChannelPosts(selectedChannel, true);
      if (isTopLevelReply) {
        setTimeout(() => {
          commentsScrollRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
    } catch (error: any) {
      Alert.alert('Comment Failed', error?.message || 'Could not add comment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activePostForComments || deletingCommentId) return;
    const targetPost = activePostForComments;
    const prevComments = comments;
    setDeletingCommentId(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await operate('communityDeleteComment', { commentId });
      setChannelPosts((prev) =>
        prev.map((p) =>
          p.id === targetPost.id
            ? { ...p, commentCount: Math.max(0, Number(p.commentCount || 0) - 1) }
            : p
        )
      );
      await openCommentsModal(targetPost, true);
      if (selectedChannel) loadChannelPosts(selectedChannel, true);
    } catch (error: any) {
      setComments(prevComments);
      Alert.alert('Error', error?.message || 'Could not delete comment.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const commentsById = useMemo(() => {
    const map = new Map<string, CommunityComment>();
    for (const c of comments) map.set(c.id, c);
    return map;
  }, [comments]);

  const displayedPosts = searchPosts !== null ? searchPosts : channelPosts;
  const displayedChannels =
    searchChannels !== null ? searchChannels : channels;

  const filteredNotices = useMemo(() => {
    const q = activeSearchTerm.toLowerCase();
    return notices.filter((n) => {
      if (noticeFilter !== 'all' && n.category !== noticeFilter) return false;
      if (q) {
        const hay = `${n.title} ${n.body} ${n.barangay}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [notices, noticeFilter, activeSearchTerm]);

  const noticeCounts = useMemo(
    () => ({
      all: notices.length,
      outbreak: notices.filter((n) => n.category === 'outbreak').length,
      advisory: notices.filter((n) => n.category === 'advisory').length,
      announcement: notices.filter((n) => n.category === 'announcement').length,
    }),
    [notices]
  );

  const getChannelStatusBadge = (ch: CommunityChannel) => {
    if (ch.isCreator) {
      return {
        label: 'Your Channel',
        bg: colors.primaryMuted,
        text: colors.primary,
      };
    }
    if (ch.privacy === 'public' || ch.canRead) {
      return {
        label: ch.privacy === 'private' ? 'Approved Member' : 'Public Access',
        bg: semantic.successBg,
        text: semantic.successText,
      };
    }
    if (ch.membership === 'pending') {
      return {
        label: 'Pending Approval',
        bg: semantic.warningBg,
        text: semantic.warningText,
      };
    }
    if (ch.membership === 'rejected') {
      return {
        label: 'Request Declined',
        bg: semantic.dangerBg,
        text: colors.danger,
      };
    }
    return {
      label: 'Private • Locked',
      bg: colors.surfaceMuted,
      text: colors.secondary,
    };
  };

  const getNoticeSeverityStyle = (
    priority: CommunityNotice['priority'],
    category: NoticeCategory
  ) => {
    if (category === 'outbreak' || priority === 'high') {
      return {
        bg: semantic.dangerBg,
        text: colors.danger,
        border: semantic.dangerBorder,
      };
    }
    if (priority === 'medium') {
      return {
        bg: semantic.warningBg,
        text: semantic.warningAccent,
        border: semantic.warningBorder,
      };
    }
    return {
      bg: colors.primaryMuted,
      text: colors.primary,
      border: colors.border,
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Read-only notice for unverified Pet Owners with direct Verify CTA */}
      {!isVerifiedOwner && (
        <View
          style={[
            styles.readOnlyBanner,
            {
              backgroundColor: semantic.warningBg,
              borderColor: semantic.warningBorder,
            },
          ]}
        >
          <View style={styles.readOnlyBannerRow}>
            <Text
              style={[
                styles.readOnlyBannerText,
                { color: semantic.warningText, flex: 1 },
              ]}
            >
              👀 Read-Only Mode: Verify your account to create channels, post,
              comment, and vote.
            </Text>
            {!isOfficer && (
              <TouchableOpacity
                style={[
                  styles.verifyCtaBtn,
                  { backgroundColor: semantic.warningAccent },
                ]}
                onPress={() => navigation.navigate('UserProfile')}
              >
                <Text style={styles.verifyCtaText}>Verify Now →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Search Bar */}
      <View
        style={[
          styles.searchBarRow,
          { backgroundColor: colors.surface },
        ]}
      >
        <View
          style={[
            styles.searchInputWrap,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search channels or discussions (2–80 chars)..."
            placeholderTextColor={colors.secondary}
            value={searchQuery}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              if (!txt.trim()) {
                setActiveSearchTerm('');
                setSearchPosts(null);
                setSearchChannels(null);
              }
            }}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.searchClearBtn}
              onPress={clearSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                style={[styles.searchClearText, { color: colors.secondary }]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.searchBtn,
            { backgroundColor: colors.primary },
            isSearching && { opacity: 0.7 },
          ]}
          onPress={() => handleSearch()}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Responsive 3-Area Switcher (Discussions | Channels | Official CVO Notices) */}
      <View
        style={[
          styles.segmentWrap,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.segmentRow,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === 'feed' && [
                styles.segmentBtnActive,
                { backgroundColor: colors.surface },
              ],
            ]}
            onPress={() => setActiveTab('feed')}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.secondary },
                activeTab === 'feed' && { color: colors.primary },
              ]}
            >
              💬 Discussions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === 'channels' && [
                styles.segmentBtnActive,
                { backgroundColor: colors.surface },
              ],
            ]}
            onPress={() => setActiveTab('channels')}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.secondary },
                activeTab === 'channels' && { color: colors.primary },
              ]}
            >
              # Channels ({channels.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === 'notices' && [
                styles.segmentBtnActive,
                { backgroundColor: colors.surface },
              ],
            ]}
            onPress={() => setActiveTab('notices')}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.secondary },
                activeTab === 'notices' && { color: colors.primary },
              ]}
            >
              📢 CVO Notices ({notices.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Global Overview Connection Error Banner */}
        {feedError && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: semantic.dangerBg,
                borderColor: semantic.dangerBorder,
              },
            ]}
          >
            <Text style={[styles.errorCardText, { color: colors.danger }]}>
              {feedError}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.danger }]}
              onPress={() => fetchCommunityData(false)}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active Search Filter Banner */}
        {activeSearchTerm.length >= 2 && (
          <View
            style={[
              styles.searchSummaryBar,
              {
                backgroundColor: colors.primaryMuted,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.searchSummaryText,
                { color: colors.text, flex: 1 },
              ]}
            >
              Search "{activeSearchTerm}":{' '}
              {activeTab === 'feed'
                ? `${searchPosts?.length ?? 0} discussions`
                : activeTab === 'channels'
                ? `${displayedChannels.length} channels`
                : `${filteredNotices.length} notices`}
            </Text>
            <TouchableOpacity onPress={clearSearch} style={styles.searchSummaryClear}>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AREA 1: DISCUSSIONS FEED */}
        {activeTab === 'feed' && (
          <>
            {/* Horizontal Channel Selector */}
            {searchPosts === null && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
              >
                {channels.map((ch) => {
                  const active = selectedChannel?.id === ch.id;
                  return (
                    <TouchableOpacity
                      key={ch.id}
                      style={[
                        styles.channelChip,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                        active && {
                          backgroundColor: colors.primaryMuted,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        setSearchPosts(null);
                        loadChannelPosts(ch, false);
                      }}
                    >
                      <Text
                        style={[
                          styles.channelChipText,
                          { color: colors.secondary },
                          active && { color: colors.primary },
                        ]}
                      >
                        {ch.privacy === 'private' ? '🔒 ' : '# '}
                        {ch.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Active Channel Header & Actions */}
            {searchPosts === null && selectedChannel && (
              <View
                style={[
                  styles.channelHeaderCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.channelTitleRow}>
                  <Text
                    style={[styles.channelTitle, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {selectedChannel.privacy === 'private' ? '🔒 ' : '# '}
                    {selectedChannel.name}
                  </Text>
                  {isVerifiedOwner &&
                    (selectedChannel.canRead ||
                      selectedChannel.privacy === 'public' ||
                      isOfficer) && (
                      <TouchableOpacity
                        style={[
                          styles.newPostBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => openCreatePostModal('discussion')}
                      >
                        <Text style={styles.newPostBtnText}>+ New Post</Text>
                      </TouchableOpacity>
                    )}
                </View>
                {selectedChannel.description ? (
                  <Text
                    style={[styles.channelDesc, { color: colors.secondary }]}
                  >
                    {selectedChannel.description}
                  </Text>
                ) : null}

                {/* Creator Controls */}
                {selectedChannel.isCreator && (
                  <View style={styles.creatorRow}>
                    <TouchableOpacity
                      style={[
                        styles.creatorSmallBtn,
                        {
                          backgroundColor: colors.surfaceMuted,
                          borderColor: colors.border,
                          borderWidth: 1,
                        },
                        busyChannelActionId === selectedChannel.id && {
                          opacity: 0.6,
                        },
                      ]}
                      disabled={busyChannelActionId === selectedChannel.id}
                      onPress={() =>
                        handleToggleChannelPrivacy(selectedChannel)
                      }
                    >
                      <Text
                        style={[
                          styles.creatorSmallBtnText,
                          { color: colors.primary },
                        ]}
                      >
                        Switch to{' '}
                        {selectedChannel.privacy === 'public'
                          ? 'Private'
                          : 'Public'}
                      </Text>
                    </TouchableOpacity>

                    {selectedChannel.privacy === 'private' && (
                      <TouchableOpacity
                        style={[
                          styles.creatorSmallBtn,
                          {
                            backgroundColor: colors.surfaceMuted,
                            borderColor: colors.border,
                            borderWidth: 1,
                          },
                          busyChannelActionId === selectedChannel.id && {
                            opacity: 0.6,
                          },
                        ]}
                        disabled={busyChannelActionId === selectedChannel.id}
                        onPress={() => handleOpenJoinRequests(selectedChannel)}
                      >
                        <Text
                          style={[
                            styles.creatorSmallBtnText,
                            { color: colors.primary },
                          ]}
                        >
                          Review Join Requests
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.creatorSmallBtn,
                        {
                          backgroundColor: semantic.dangerBg,
                          borderColor: semantic.dangerBorder,
                          borderWidth: 1,
                        },
                        busyChannelActionId === selectedChannel.id && {
                          opacity: 0.6,
                        },
                      ]}
                      disabled={busyChannelActionId === selectedChannel.id}
                      onPress={() => handleDeleteChannel(selectedChannel)}
                    >
                      <Text
                        style={[
                          styles.creatorSmallBtnText,
                          { color: colors.danger },
                        ]}
                      >
                        🗑️ Delete Channel
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Non-member Private Channel Gate */}
                {selectedChannel.privacy === 'private' &&
                  !selectedChannel.canRead && (
                    <View
                      style={[
                        styles.privateGateBox,
                        {
                          backgroundColor: semantic.warningBg,
                          borderColor: semantic.warningBorder,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.privateGateText,
                          { color: semantic.warningText },
                        ]}
                      >
                        This is a private channel. Request membership from the
                        channel creator to view posts and attachments.
                      </Text>
                      {selectedChannel.membership === 'pending' ? (
                        <Text
                          style={[
                            styles.pendingMembershipText,
                            { color: semantic.warningAccent },
                          ]}
                        >
                          ⏳ Membership Request Pending Creator Approval
                        </Text>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.joinBtn,
                            { backgroundColor: semantic.warningAccent },
                            busyChannelActionId === selectedChannel.id && {
                              opacity: 0.65,
                            },
                          ]}
                          disabled={busyChannelActionId === selectedChannel.id}
                          onPress={() =>
                            handleRequestJoinPrivate(selectedChannel)
                          }
                        >
                          {busyChannelActionId === selectedChannel.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.joinBtnText}>
                              Request to Join Private Channel
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
              </View>
            )}

            {/* Channel-Specific Posts Loader or Error */}
            {isLoadingPosts ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.emptySub, { color: colors.secondary }]}>
                  Loading discussions in #{selectedChannel?.name}...
                </Text>
              </View>
            ) : postsError && searchPosts === null ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: semantic.dangerBorder,
                  },
                ]}
              >
                <Text style={styles.emptyIcon}>⚠️</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Could Not Load Discussions
                </Text>
                <Text style={[styles.emptySub, { color: colors.secondary }]}>
                  {postsError}
                </Text>
                {selectedChannel && (
                  <TouchableOpacity
                    style={[
                      styles.emptyActionBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => loadChannelPosts(selectedChannel, false)}
                  >
                    <Text style={styles.emptyActionBtnText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : displayedPosts.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {searchPosts !== null
                    ? 'No Results Found'
                    : 'No Discussions Yet'}
                </Text>
                <Text style={[styles.emptySub, { color: colors.secondary }]}>
                  {searchPosts !== null
                    ? `No discussions match "${activeSearchTerm}". Try a different term or clear search.`
                    : 'Select a public channel or tap "+ New Post" to start a conversation.'}
                </Text>
                {searchPosts !== null ? (
                  <TouchableOpacity
                    style={[
                      styles.emptyActionBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={clearSearch}
                  >
                    <Text style={styles.emptyActionBtnText}>Clear Search</Text>
                  </TouchableOpacity>
                ) : isVerifiedOwner &&
                  selectedChannel &&
                  (selectedChannel.canRead ||
                    selectedChannel.privacy === 'public' ||
                    isOfficer) ? (
                  <TouchableOpacity
                    style={[
                      styles.emptyActionBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => openCreatePostModal('discussion')}
                  >
                    <Text style={styles.emptyActionBtnText}>
                      + Start First Discussion
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              displayedPosts.map((post) => {
                const isAuthor =
                  user?.id && String(post.authorId) === String(user.id);
                const isOfficialAuthor = isOfficialStaffAuthor(
                  post,
                  user?.id,
                  isOfficer
                );
                const imageIds = parseImageFileIds(post.imageFileIds);
                const isVoting = Boolean(votingTargets[`post:${post.id}`]);
                const matchingChannelObj = post.channelId
                  ? channels.find((c) => c.id === post.channelId)
                  : undefined;

                return (
                  <View
                    key={post.id}
                    style={[
                      styles.postCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.postHeader}>
                      <View style={styles.authorMetaRow}>
                        <Text
                          style={[styles.postAuthorName, { color: colors.text }]}
                        >
                          👤 {post.authorName}
                        </Text>
                        {isOfficialAuthor && (
                          <View
                            style={[
                              styles.officialAuthorBadge,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Text style={styles.officialAuthorBadgeText}>
                              Official / CVO
                            </Text>
                          </View>
                        )}
                        <Text
                          style={[
                            styles.postTimestamp,
                            { color: colors.secondary },
                          ]}
                        >
                          • {new Date(post.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      {isAuthor && (
                        <TouchableOpacity
                          style={[
                            styles.deletePillBtn,
                            {
                              backgroundColor: semantic.dangerBg,
                              borderColor: semantic.dangerBorder,
                            },
                          ]}
                          disabled={deletingPostId === post.id}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          onPress={() => handleDeletePost(post.id)}
                        >
                          <Text
                            style={[styles.deleteText, { color: colors.danger }]}
                          >
                            Delete
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Channel attribution tag when viewing cross-channel search results */}
                    {searchPosts !== null && post.channelName ? (
                      <TouchableOpacity
                        style={[
                          styles.searchChannelPill,
                          {
                            backgroundColor: colors.primaryMuted,
                            alignSelf: 'flex-start',
                          },
                        ]}
                        onPress={() => {
                          if (matchingChannelObj) {
                            clearSearch();
                            loadChannelPosts(matchingChannelObj, false);
                          }
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: colors.primary,
                          }}
                        >
                          # {post.channelName}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <Text style={[styles.postTitle, { color: colors.text }]}>
                      {post.title}
                    </Text>
                    <Text
                      style={[styles.postBody, { color: colors.secondary }]}
                    >
                      {post.body}
                    </Text>

                    {/* Private Storage Images via 5-Min Signed Token (`communityImageToken`) */}
                    {imageIds.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginVertical: 10 }}
                      >
                        {imageIds.map((fid, idx) => (
                          <SignedCommunityImage
                            key={`${post.id}-${fid}`}
                            postId={post.id}
                            fileId={fid}
                            index={idx}
                            total={imageIds.length}
                            styles={styles}
                            accentColor={colors.primary}
                            secondaryColor={colors.secondary}
                            onPreview={(uri) => setPreviewImageUri(uri)}
                          />
                        ))}
                      </ScrollView>
                    )}

                    {/* Vote & Comment Bar */}
                    <View
                      style={[
                        styles.postFooter,
                        { borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.voteGroup}>
                        <TouchableOpacity
                          style={[
                            styles.voteBtn,
                            { backgroundColor: colors.surfaceMuted },
                            post.myVote === 1 && {
                              backgroundColor: semantic.successBg,
                              borderColor: semantic.successBorder,
                            },
                            isVoting && { opacity: 0.7 },
                          ]}
                          disabled={isVoting}
                          onPress={() => handleVote('post', post.id, 1)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text
                            style={[
                              styles.voteBtnText,
                              { color: colors.secondary },
                              post.myVote === 1 && {
                                color: semantic.successText,
                              },
                            ]}
                          >
                            ▲ {post.upvotes ?? 0}
                          </Text>
                        </TouchableOpacity>

                        <Text
                          style={[
                            styles.scoreText,
                            { color: colors.secondary },
                          ]}
                        >
                          Score: {post.score ?? 0}
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.voteBtn,
                            { backgroundColor: colors.surfaceMuted },
                            post.myVote === -1 && {
                              backgroundColor: semantic.dangerBg,
                              borderColor: semantic.dangerBorder,
                            },
                            isVoting && { opacity: 0.7 },
                          ]}
                          disabled={isVoting}
                          onPress={() => handleVote('post', post.id, -1)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text
                            style={[
                              styles.voteBtnText,
                              { color: colors.secondary },
                              post.myVote === -1 && { color: colors.danger },
                            ]}
                          >
                            ▼ {post.downvotes ?? 0}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.commentBtn,
                          {
                            backgroundColor: colors.primaryMuted,
                            borderColor: colors.primary,
                          },
                        ]}
                        onPress={() => openCommentsModal(post)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text
                          style={[
                            styles.commentBtnText,
                            { color: colors.primary },
                          ]}
                        >
                          💬 Comments ({post.commentCount ?? 0})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* AREA 2: CHANNEL DIRECTORY */}
        {activeTab === 'channels' && (
          <>
            {isVerifiedOwner && (
              <TouchableOpacity
                style={[
                  styles.createChannelBtn,
                  {
                    backgroundColor: semantic.successBg,
                    borderColor: semantic.successBorder,
                  },
                ]}
                onPress={() => setIsCreateChannelVisible(true)}
              >
                <Text
                  style={[
                    styles.createChannelBtnText,
                    { color: semantic.successText },
                  ]}
                >
                  + Create New Community Channel (Max 10)
                </Text>
              </TouchableOpacity>
            )}

            {displayedChannels.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.emptyIcon}>#️⃣</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {searchChannels !== null
                    ? 'No Matching Channels'
                    : 'No Channels Available'}
                </Text>
                <Text style={[styles.emptySub, { color: colors.secondary }]}>
                  {searchChannels !== null
                    ? `No community channels match "${activeSearchTerm}".`
                    : 'Create the first community channel to start connecting with pet owners.'}
                </Text>
                {searchChannels !== null && (
                  <TouchableOpacity
                    style={[
                      styles.emptyActionBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={clearSearch}
                  >
                    <Text style={styles.emptyActionBtnText}>Clear Search</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              displayedChannels.map((ch) => {
                const statusBadge = getChannelStatusBadge(ch);
                const isBusy = busyChannelActionId === ch.id;
                return (
                  <View
                    key={ch.id}
                    style={[
                      styles.postCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.channelTitleRow}>
                      <Text
                        style={[
                          styles.postTitle,
                          { color: colors.text, flex: 1, marginRight: 8 },
                        ]}
                        numberOfLines={2}
                      >
                        {ch.privacy === 'private' ? '🔒 ' : '# '}
                        {ch.name}
                      </Text>
                      <View
                        style={[
                          styles.privacyBadge,
                          { backgroundColor: colors.primaryMuted },
                        ]}
                      >
                        <Text
                          style={[
                            styles.privacyBadgeText,
                            { color: colors.primary },
                          ]}
                        >
                          {ch.privacy.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[styles.postBody, { color: colors.secondary }]}
                    >
                      {ch.description || 'Iligan Pet Owner Community Channel'}
                    </Text>

                    {ch.createdByName ? (
                      <Text
                        style={[
                          styles.channelCreatorMeta,
                          { color: colors.secondary },
                        ]}
                      >
                        Created by {ch.createdByName}
                      </Text>
                    ) : null}

                    <View style={styles.directoryCardFooter}>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: statusBadge.bg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: statusBadge.text },
                          ]}
                        >
                          {statusBadge.label}
                        </Text>
                      </View>

                      <View style={styles.directoryActionsRow}>
                        {ch.isCreator && ch.privacy === 'private' && (
                          <TouchableOpacity
                            style={[
                              styles.creatorSmallBtn,
                              {
                                backgroundColor: colors.surfaceMuted,
                                borderColor: colors.border,
                                borderWidth: 1,
                              },
                              isBusy && { opacity: 0.6 },
                            ]}
                            disabled={isBusy}
                            onPress={() => handleOpenJoinRequests(ch)}
                          >
                            <Text
                              style={[
                                styles.creatorSmallBtnText,
                                { color: colors.primary },
                              ]}
                            >
                              Requests
                            </Text>
                          </TouchableOpacity>
                        )}

                        {ch.privacy === 'private' &&
                          !ch.canRead &&
                          ch.membership !== 'pending' &&
                          !isOfficer && (
                            <TouchableOpacity
                              style={[
                                styles.newPostBtn,
                                { backgroundColor: semantic.warningAccent },
                                isBusy && { opacity: 0.65 },
                              ]}
                              disabled={isBusy}
                              onPress={() => handleRequestJoinPrivate(ch)}
                            >
                              <Text style={styles.newPostBtnText}>
                                Request Join
                              </Text>
                            </TouchableOpacity>
                          )}

                        <TouchableOpacity
                          style={[
                            styles.newPostBtn,
                            { backgroundColor: colors.primary },
                          ]}
                          onPress={() => {
                            setActiveTab('feed');
                            loadChannelPosts(ch, false);
                          }}
                        >
                          <Text style={styles.newPostBtnText}>
                            Open Channel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* AREA 3: OFFICIAL CVO OWNER NOTICES & OUTBREAK ALERTS (`communityOfficialNotices`) */}
        {activeTab === 'notices' && (
          <>
            <View
              style={[
                styles.officialHeaderBanner,
                { backgroundColor: semantic.bannerBg },
              ]}
            >
              <Text style={styles.officialHeaderTitle}>
                🏛️ Official Iligan City Veterinary Office Notices
              </Text>
              <Text
                style={[
                  styles.officialHeaderSub,
                  { color: semantic.bannerSub },
                ]}
              >
                Official CVO owner-directed outbreak advisories and public
                announcements.
              </Text>
              {isOfficer && (
                <TouchableOpacity
                  style={[
                    styles.newPostBtn,
                    {
                      backgroundColor: colors.primary,
                      alignSelf: 'flex-start',
                      marginTop: 10,
                    },
                  ]}
                  onPress={() => openCreatePostModal('announcement')}
                >
                  <Text style={styles.newPostBtnText}>
                    + New Official Channel Post
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {(
                [
                  { key: 'all', label: `All (${noticeCounts.all})` },
                  {
                    key: 'outbreak',
                    label: `🚨 Outbreaks (${noticeCounts.outbreak})`,
                  },
                  {
                    key: 'advisory',
                    label: `⚠️ Advisories (${noticeCounts.advisory})`,
                  },
                  {
                    key: 'announcement',
                    label: `📢 Announcements (${noticeCounts.announcement})`,
                  },
                ] as const
              ).map((item) => {
                const selected = noticeFilter === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.channelChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                      selected && {
                        backgroundColor: colors.primaryMuted,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setNoticeFilter(item.key)}
                  >
                    <Text
                      style={[
                        styles.channelChipText,
                        { color: colors.secondary },
                        selected && { color: colors.primary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredNotices.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.emptyIcon}>📢</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {notices.length === 0
                    ? 'No Active CVO Owner Notices'
                    : 'No Matching Notices'}
                </Text>
                <Text style={[styles.emptySub, { color: colors.secondary }]}>
                  {notices.length === 0
                    ? 'Official outbreak alerts shared with pet owners and CVO announcements will appear here.'
                    : 'Try selecting a different category filter or clearing your search.'}
                </Text>
                {(noticeFilter !== 'all' || activeSearchTerm.length > 0) && (
                  <TouchableOpacity
                    style={[
                      styles.emptyActionBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => {
                      setNoticeFilter('all');
                      if (activeSearchTerm) clearSearch();
                    }}
                  >
                    <Text style={styles.emptyActionBtnText}>Reset Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredNotices.map((n) => {
                const sev = getNoticeSeverityStyle(n.priority, n.category);
                return (
                  <View
                    key={n.id}
                    style={[
                      styles.noticeCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: sev.border,
                        borderLeftColor: sev.text,
                      },
                    ]}
                  >
                    <View style={styles.noticeBadgesRow}>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: colors.primaryMuted },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: colors.primary },
                          ]}
                        >
                          ✓ CVO • {String(n.category).toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={[styles.statusPill, { backgroundColor: sev.bg }]}
                      >
                        <Text
                          style={[styles.statusPillText, { color: sev.text }]}
                        >
                          Priority: {String(n.priority || 'info').toUpperCase()}
                        </Text>
                      </View>
                      {n.audience ? (
                        <View
                          style={[
                            styles.statusPill,
                            { backgroundColor: colors.surfaceMuted },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              { color: colors.secondary },
                            ]}
                          >
                            {n.audience === 'both'
                              ? 'Citywide'
                              : n.audience === 'officers'
                              ? 'Staff'
                              : 'Pet Owners'}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={[styles.postTitle, { color: colors.text }]}>
                      {n.title}
                    </Text>
                    {n.barangay ? (
                      <Text
                        style={[styles.noticeBrgy, { color: colors.text }]}
                      >
                        📍 Barangay: {n.barangay}
                      </Text>
                    ) : null}
                    <Text
                      style={[styles.postBody, { color: colors.secondary }]}
                    >
                      {String(n.body || '').replace(
                        /^\[Barangay:\s*([^\]]+)\]\s*\n?/i,
                        ''
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.postTimestamp,
                        { color: colors.secondary, marginTop: 8 },
                      ]}
                    >
                      Published: {new Date(n.date).toLocaleString()}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Modal 1: Create Channel (`communityCreateChannel`) */}
      <Modal
        visible={isCreateChannelVisible}
        animationType="slide"
        transparent
        onRequestClose={resetCreateChannelModal}
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
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Create Community Channel
              </Text>
              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
                Channel Name (1–80 chars) *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                maxLength={80}
                value={newChannelName}
                onChangeText={setNewChannelName}
                placeholder="e.g. Iligan Cat Owners Club"
                placeholderTextColor={colors.secondary}
              />
              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
                Description (0–300 chars, optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    height: 76,
                    textAlignVertical: 'top',
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                maxLength={300}
                multiline
                value={newChannelDesc}
                onChangeText={setNewChannelDesc}
                placeholder="What is this channel about?"
                placeholderTextColor={colors.secondary}
              />
              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
                Channel Privacy
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {(['public', 'private'] as const).map((p) => {
                  const selected = newChannelPrivacy === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.privacyChoice,
                        { borderColor: colors.border },
                        selected && {
                          backgroundColor: colors.primaryMuted,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => setNewChannelPrivacy(p)}
                    >
                      <Text
                        style={[
                          styles.privacyChoiceText,
                          { color: colors.secondary },
                          selected && {
                            color: colors.primary,
                            fontWeight: 'bold',
                          },
                        ]}
                      >
                        {p === 'public'
                          ? '🌐 Public'
                          : '🔒 Private (Approval)'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  disabled={isSubmitting}
                  onPress={resetCreateChannelModal}
                >
                  <Text
                    style={[styles.cancelBtnText, { color: colors.secondary }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (!newChannelName.trim() || isSubmitting) && {
                      opacity: 0.55,
                    },
                  ]}
                  onPress={handleCreateChannel}
                  disabled={!newChannelName.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Create Channel</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Create Post (`communityCreatePost` with up to 4 images) */}
      <Modal
        visible={isCreatePostVisible}
        animationType="slide"
        transparent
        onRequestClose={resetCreatePostModal}
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
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isOfficer && postKind === 'announcement'
                  ? 'Publish Official Staff Post'
                  : 'Create Community Discussion'}
              </Text>

              {/* Channel Selector inside Create Post Modal */}
              {writableChannels.length > 0 && (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: colors.secondary }]}
                  >
                    Target Channel *
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 6 }}
                  >
                    {writableChannels.map((ch) => {
                      const active =
                        (postTargetChannelId || selectedChannel?.id) === ch.id;
                      return (
                        <TouchableOpacity
                          key={ch.id}
                          style={[
                            styles.channelChip,
                            {
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                            active && {
                              backgroundColor: colors.primaryMuted,
                              borderColor: colors.primary,
                            },
                          ]}
                          onPress={() => setPostTargetChannelId(ch.id)}
                        >
                          <Text
                            style={[
                              styles.channelChipText,
                              { color: colors.secondary },
                              active && { color: colors.primary },
                            ]}
                          >
                            {ch.privacy === 'private' ? '🔒 ' : '# '}
                            {ch.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {isOfficer && (
                <>
                  <Text
                    style={[styles.fieldLabel, { color: colors.secondary }]}
                  >
                    Post Type
                  </Text>
                  <View
                    style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}
                  >
                    {(['discussion', 'announcement'] as const).map((kind) => {
                      const selected = postKind === kind;
                      return (
                        <TouchableOpacity
                          key={kind}
                          style={[
                            styles.privacyChoice,
                            { borderColor: colors.border },
                            selected && {
                              backgroundColor: colors.primaryMuted,
                              borderColor: colors.primary,
                            },
                          ]}
                          onPress={() => setPostKind(kind)}
                        >
                          <Text
                            style={[
                              styles.privacyChoiceText,
                              { color: colors.secondary },
                              selected && {
                                color: colors.primary,
                                fontWeight: 'bold',
                              },
                            ]}
                          >
                            {kind === 'discussion'
                              ? '💬 Discussion Post'
                              : '📢 Official CVO Tag'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
                Title (1–140 chars) *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                maxLength={140}
                value={postTitle}
                onChangeText={setPostTitle}
                placeholder="Discussion title..."
                placeholderTextColor={colors.secondary}
              />
              <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
                Body (1–5000 chars) *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    height: 110,
                    textAlignVertical: 'top',
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                maxLength={5000}
                multiline
                value={postBody}
                onChangeText={setPostBody}
                placeholder="Write your discussion..."
                placeholderTextColor={colors.secondary}
              />
              <TouchableOpacity
                style={[
                  styles.attachBtn,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                disabled={isSubmitting}
                onPress={handlePickPostImage}
              >
                <Text
                  style={[styles.attachBtnText, { color: colors.primary }]}
                >
                  📷 Attach Private Image ({postImages.length}/4 selected)
                </Text>
              </TouchableOpacity>

              {postImages.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                >
                  {postImages.map((item, idx) => (
                    <View key={idx} style={{ marginRight: 10 }}>
                      <Image
                        source={{ uri: item.asset.uri }}
                        style={{ width: 68, height: 68, borderRadius: 10 }}
                      />
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        disabled={isSubmitting}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        onPress={() =>
                          setPostImages((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <Text
                          style={{
                            color: colors.danger,
                            fontSize: 11,
                            fontWeight: '700',
                            textAlign: 'center',
                          }}
                        >
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  disabled={isSubmitting}
                  onPress={resetCreatePostModal}
                >
                  <Text
                    style={[styles.cancelBtnText, { color: colors.secondary }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (!postTitle.trim() || !postBody.trim() || isSubmitting) && {
                      opacity: 0.55,
                    },
                  ]}
                  onPress={handleCreatePost}
                  disabled={
                    !postTitle.trim() || !postBody.trim() || isSubmitting
                  }
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Publish Post</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 3: Threaded Comments & Replies (`communityComments`) */}
      <Modal
        visible={!!activePostForComments}
        animationType="slide"
        transparent
        onRequestClose={() => setActivePostForComments(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, maxHeight: '88%' },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text
                style={[styles.modalTitle, { color: colors.text, flex: 1, marginBottom: 0 }]}
                numberOfLines={2}
              >
                Comments: {activePostForComments?.title}
              </Text>
              <TouchableOpacity
                style={[
                  styles.modalCloseIconBtn,
                  { backgroundColor: colors.surfaceMuted },
                ]}
                onPress={() => setActivePostForComments(null)}
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

            <ScrollView
              ref={commentsScrollRef}
              keyboardShouldPersistTaps="handled"
              style={styles.commentsScroll}
            >
              {loadingComments ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : commentsError ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={[styles.emptySub, { color: colors.danger }]}>
                    {commentsError}
                  </Text>
                  {activePostForComments && (
                    <TouchableOpacity
                      style={[
                        styles.emptyActionBtn,
                        { backgroundColor: colors.primary },
                      ]}
                      onPress={() =>
                        openCommentsModal(activePostForComments, false)
                      }
                    >
                      <Text style={styles.emptyActionBtnText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : comments.length === 0 ? (
                <Text
                  style={[
                    styles.emptySub,
                    { color: colors.secondary, marginVertical: 18 },
                  ]}
                >
                  No comments yet. Be the first to share your thoughts!
                </Text>
              ) : (
                comments.map((c) => {
                  const isMyComment =
                    user?.id && String(c.authorId) === String(user.id);
                  const isOfficialCommentAuthor = isOfficialStaffAuthor(
                    c,
                    user?.id,
                    isOfficer
                  );
                  const parentComment = c.parentCommentId
                    ? commentsById.get(c.parentCommentId)
                    : undefined;
                  const isVotingComment = Boolean(
                    votingTargets[`comment:${c.id}`]
                  );

                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.commentItem,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                        c.parentCommentId
                          ? {
                              marginLeft: 16,
                              borderLeftWidth: 3,
                              borderLeftColor: colors.primary,
                            }
                          : null,
                      ]}
                    >
                      {parentComment && (
                        <Text
                          style={[
                            styles.replyContextText,
                            { color: colors.primary },
                          ]}
                          numberOfLines={1}
                        >
                          ↳ Replying to {parentComment.authorName}
                        </Text>
                      )}
                      <View style={styles.postHeader}>
                        <View style={styles.authorMetaRow}>
                          <Text
                            style={[
                              styles.postAuthorName,
                              { color: colors.text },
                            ]}
                          >
                            {c.authorName}
                          </Text>
                          {isOfficialCommentAuthor && (
                            <View
                              style={[
                                styles.officialAuthorBadge,
                                { backgroundColor: colors.primary },
                              ]}
                            >
                              <Text style={styles.officialAuthorBadgeText}>
                                Official / CVO
                              </Text>
                            </View>
                          )}
                          <Text
                            style={[
                              styles.postTimestamp,
                              { color: colors.secondary },
                            ]}
                          >
                            • {new Date(c.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        {isMyComment && (
                          <TouchableOpacity
                            style={[
                              styles.commentActionPill,
                              { backgroundColor: semantic.dangerBg },
                            ]}
                            disabled={deletingCommentId === c.id}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            onPress={() => handleDeleteComment(c.id)}
                          >
                            <Text
                              style={[
                                styles.deleteText,
                                { color: colors.danger },
                              ]}
                            >
                              Delete
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.postBody, { color: colors.text }]}>
                        {c.body}
                      </Text>
                      <View style={styles.commentActions}>
                        <TouchableOpacity
                          style={[
                            styles.commentActionPill,
                            { backgroundColor: colors.surfaceMuted },
                            c.myVote === 1 && {
                              backgroundColor: semantic.successBg,
                            },
                            isVotingComment && { opacity: 0.7 },
                          ]}
                          disabled={isVotingComment}
                          onPress={() => handleVote('comment', c.id, 1)}
                        >
                          <Text
                            style={[
                              styles.voteSmall,
                              { color: colors.secondary },
                              c.myVote === 1 && {
                                color: semantic.successText,
                              },
                            ]}
                          >
                            ▲ {c.upvotes ?? 0}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.commentActionPill,
                            { backgroundColor: colors.surfaceMuted },
                            c.myVote === -1 && {
                              backgroundColor: semantic.dangerBg,
                            },
                            isVotingComment && { opacity: 0.7 },
                          ]}
                          disabled={isVotingComment}
                          onPress={() => handleVote('comment', c.id, -1)}
                        >
                          <Text
                            style={[
                              styles.voteSmall,
                              { color: colors.secondary },
                              c.myVote === -1 && { color: colors.danger },
                            ]}
                          >
                            ▼ {c.downvotes ?? 0}
                          </Text>
                        </TouchableOpacity>

                        {isVerifiedOwner && (
                          <TouchableOpacity
                            style={[
                              styles.commentActionPill,
                              { backgroundColor: colors.primaryMuted },
                            ]}
                            onPress={() => {
                              setReplyToComment({
                                id: c.id,
                                authorName: c.authorName,
                                snippet: String(c.body || '')
                                  .trim()
                                  .slice(0, 42),
                              });
                              setTimeout(
                                () => commentInputRef.current?.focus(),
                                80
                              );
                            }}
                          >
                            <Text
                              style={[
                                styles.replyLink,
                                { color: colors.primary },
                              ]}
                            >
                              Reply
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {isVerifiedOwner && (
              <>
                {replyToComment ? (
                  <TouchableOpacity
                    style={[
                      styles.replyingBannerBox,
                      {
                        backgroundColor: colors.primaryMuted,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setReplyToComment(null)}
                  >
                    <Text
                      style={[
                        styles.replyingBanner,
                        { color: colors.primary, marginBottom: 0 },
                      ]}
                      numberOfLines={1}
                    >
                      Replying to {replyToComment.authorName}: "
                      {replyToComment.snippet}" (Tap to cancel)
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TextInput
                  ref={commentInputRef}
                  style={[
                    styles.input,
                    {
                      maxHeight: 96,
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  multiline
                  maxLength={2000}
                  placeholder={
                    replyToComment
                      ? `Reply to ${replyToComment.authorName}...`
                      : 'Write a comment...'
                  }
                  placeholderTextColor={colors.secondary}
                  value={newCommentBody}
                  onChangeText={setNewCommentBody}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                disabled={isSubmitting}
                onPress={() => setActivePostForComments(null)}
              >
                <Text
                  style={[styles.cancelBtnText, { color: colors.secondary }]}
                >
                  Close
                </Text>
              </TouchableOpacity>
              {isVerifiedOwner && (
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (!newCommentBody.trim() || isSubmitting) && {
                      opacity: 0.55,
                    },
                  ]}
                  onPress={handleAddComment}
                  disabled={!newCommentBody.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Post Comment</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 4: Channel Creator Private Join Requests (`communityJoinRequests`) */}
      <Modal
        visible={isJoinReqModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsJoinReqModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Pending Join Requests
              {joinReqChannel ? ` • #${joinReqChannel.name}` : ''}
            </Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {joinRequests.length === 0 ? (
                <Text
                  style={[
                    styles.emptySub,
                    { color: colors.secondary, marginVertical: 14 },
                  ]}
                >
                  No pending requests for this channel.
                </Text>
              ) : (
                joinRequests.map((req) => {
                  const isBusy = reviewingReqId === req.id;
                  return (
                    <View
                      key={req.id}
                      style={[
                        styles.commentItem,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.postTitle, { color: colors.text }]}>
                        {req.userName}
                      </Text>
                      <Text
                        style={[
                          styles.postTimestamp,
                          { color: colors.secondary },
                        ]}
                      >
                        Requested{' '}
                        {new Date(req.requestedAt).toLocaleDateString()}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <TouchableOpacity
                          style={[
                            styles.cancelBtn,
                            {
                              borderColor: colors.danger,
                              backgroundColor: semantic.dangerBg,
                            },
                            isBusy && { opacity: 0.6 },
                          ]}
                          disabled={Boolean(reviewingReqId)}
                          onPress={() =>
                            handleReviewJoinRequest(req.id, 'rejected')
                          }
                        >
                          {isBusy ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.danger}
                            />
                          ) : (
                            <Text
                              style={{
                                color: colors.danger,
                                fontWeight: 'bold',
                              }}
                            >
                              Reject
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.submitBtn,
                            { backgroundColor: semantic.successText },
                            isBusy && { opacity: 0.6 },
                          ]}
                          disabled={Boolean(reviewingReqId)}
                          onPress={() =>
                            handleReviewJoinRequest(req.id, 'approved')
                          }
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.submitBtnText}>Approve</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                { marginTop: 12, borderColor: colors.border },
              ]}
              onPress={() => setIsJoinReqModalVisible(false)}
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

      {/* Modal 5: Fullscreen Image Preview */}
      <Modal
        visible={!!previewImageUri}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <TouchableOpacity
            style={styles.imagePreviewCloseBtn}
            onPress={() => setPreviewImageUri(null)}
          >
            <Text style={styles.imagePreviewCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.imagePreviewFull}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F5FA' },
  readOnlyBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  readOnlyBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readOnlyBannerText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  verifyCtaBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  verifyCtaText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  searchBarRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchClearBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchClearText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchBtn: {
    height: 44,
    minWidth: 74,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  segmentWrap: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: { fontSize: 12, fontWeight: '700' },
  scrollContent: { padding: 14, paddingBottom: 60 },
  errorCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  errorCardText: { flex: 1, fontSize: 12, fontWeight: '600' },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  searchSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchSummaryText: { fontSize: 12, fontWeight: '600' },
  searchSummaryClear: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  channelChip: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    marginRight: 8,
  },
  channelChipText: { fontSize: 12, fontWeight: 'bold' },
  channelHeaderCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  channelTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  channelTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  channelDesc: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  newPostBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  newPostBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  creatorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  creatorSmallBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorSmallBtnText: { fontSize: 12, fontWeight: '700' },
  privateGateBox: {
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  privateGateText: { fontSize: 12, marginBottom: 8, lineHeight: 17 },
  pendingMembershipText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  joinBtn: {
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  postCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  authorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  officialAuthorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  officialAuthorBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  postAuthorName: { fontSize: 12, fontWeight: '700' },
  postTimestamp: { fontSize: 11, fontWeight: '500' },
  deletePillBtn: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { fontSize: 11, fontWeight: 'bold' },
  searchChannelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  postBody: { fontSize: 13, lineHeight: 19 },
  imageTokenPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    padding: 8,
  },
  postImageTouchWrap: {
    position: 'relative',
    marginRight: 8,
  },
  postAttachedImage: {
    width: 140,
    height: 140,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  imageCounterBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  voteGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteBtn: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voteBtnText: { fontSize: 12, fontWeight: 'bold' },
  scoreText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginHorizontal: 2,
  },
  commentBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  commentBtnText: { fontSize: 12, fontWeight: 'bold' },
  createChannelBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  createChannelBtnText: { fontSize: 13, fontWeight: 'bold' },
  privacyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  privacyBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  channelCreatorMeta: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
  directoryCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  directoryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  officialHeaderBanner: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  officialHeaderTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  officialHeaderSub: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  noticeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noticeBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  noticeBrgy: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  emptyCard: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold' },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
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
    marginBottom: 8,
  },
  modalCloseIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  privacyChoice: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyChoiceText: { fontSize: 12, fontWeight: '600' },
  attachBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 42,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  attachBtnText: { fontSize: 12, fontWeight: 'bold' },
  removeImageBtn: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  commentsScroll: {
    flexGrow: 0,
    flexShrink: 1,
    marginVertical: 8,
  },
  commentItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  replyContextText: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  commentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  commentActionPill: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voteSmall: { fontSize: 12, fontWeight: 'bold' },
  replyLink: { fontSize: 12, fontWeight: 'bold' },
  replyingBannerBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
  },
  replyingBanner: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    minHeight: 44,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  imagePreviewCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  imagePreviewCloseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  imagePreviewFull: {
    width: '100%',
    height: '78%',
  },
});
