import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  operate,
  uploadMediaFile,
  getOwnedImageUri,
  getMediaFileUrl,
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
} from '../../store/types/adoption';

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

/**
 * Resolves a 5-minute signed URL from `communityImageToken`, with fallback to
 * authenticated SDK binary download (`getOwnedImageUri`) if token view requires session headers.
 */
function SignedCommunityImage({
  postId,
  fileId,
  styles,
}: {
  postId: string;
  fileId: string;
  styles: any;
}) {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFailed(false);

    (async () => {
      try {
        const res = await operate<{ url?: string; viewUrl?: string }>(
          'communityImageToken',
          { postId, fileId }
        );
        const tokenUrl = res?.url || res?.viewUrl;
        if (mounted && tokenUrl) {
          setResolvedUri(tokenUrl);
          return;
        }
      } catch {
        // Fallback below if token action fails
      }

      // Fallback 1: Authenticated local cache via Appwrite Storage SDK
      const localUri = await getOwnedImageUri(fileId);
      if (mounted && localUri) {
        setResolvedUri(localUri);
        return;
      }

      // Fallback 2: Standard storage view URL
      const directUrl = getMediaFileUrl(fileId);
      if (mounted && directUrl) {
        setResolvedUri(directUrl);
      } else if (mounted) {
        setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [postId, fileId]);

  if (failed) {
    return (
      <View style={styles.imageTokenPlaceholder}>
        <Text style={{ fontSize: 10, color: '#64748B', textAlign: 'center' }}>
          Image unavailable
        </Text>
      </View>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={styles.imageTokenPlaceholder}>
        <ActivityIndicator size="small" color="#00AEEF" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={styles.postAttachedImage}
      resizeMode="cover"
      onError={async () => {
        // If HTTP signed URL fails due to missing session cookie, try SDK binary download
        const backup = await getOwnedImageUri(fileId);
        if (backup && backup !== resolvedUri) {
          setResolvedUri(backup);
        } else {
          setFailed(true);
        }
      }}
    />
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
  const route = useRoute<any>();
  const { user } = useAuthStore();
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

  // Overview state
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [notices, setNotices] = useState<CommunityNotice[]>([]);
  const [selectedChannel, setSelectedChannel] =
    useState<CommunityChannel | null>(null);
  const selectedChannelRef = useRef<CommunityChannel | null>(null);
  selectedChannelRef.current = selectedChannel;
  const [channelPosts, setChannelPosts] = useState<CommunityPost[]>([]);

  // Search state (`communitySearch`)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPosts, setSearchPosts] = useState<CommunityPost[] | null>(null);

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
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postImages, setPostImages] = useState<ImagePicker.ImagePickerAsset[]>(
    []
  );

  // Post Comments & Replies Modal (`communityComments`, `communityCreateComment`)
  const [activePostForComments, setActivePostForComments] =
    useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState<string>('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Channel Creator Join Requests Modal (`communityJoinRequests`, `communityReviewJoin`)
  const [isJoinReqModalVisible, setIsJoinReqModalVisible] = useState(false);
  const [joinRequests, setJoinRequests] = useState<ChannelJoinRequest[]>([]);

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

  const loadChannelPosts = useCallback(
    async (channel: CommunityChannel) => {
      setSelectedChannel(channel);
      if (!channel.canRead && channel.privacy === 'private' && !isOfficer) {
        setChannelPosts([]);
        return;
      }
      try {
        const res = await operate<{
          channel?: CommunityChannel;
          posts?: CommunityPost[];
        }>('communityChannel', { channelId: channel.id });
        setChannelPosts(normalizePosts(res?.posts || []));
      } catch (error) {
        console.warn('communityChannel warning:', error);
        setChannelPosts([]);
      }
    },
    [isOfficer]
  );

  const fetchCommunityData = useCallback(async () => {
    setIsLoading(true);
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

      if (requestedTab) {
        setActiveTab(requestedTab);
      } else if (requestedChannelId || requestedPostId) {
        setActiveTab('feed');
      }

      const currentSelected = selectedChannelRef.current;
      let channelToLoad: CommunityChannel | undefined;

      if (requestedChannelId) {
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
        channelToLoad = fetchedChannels.find(
          (c) => c.privacy === 'public' || c.canRead
        );
      }

      if (channelToLoad) {
        setSelectedChannel(channelToLoad);
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
            const posts = normalizePosts(res?.posts || []);
            setChannelPosts(posts);
            if (requestedPostId) {
              const targetPost = posts.find(
                (p) => String(p.id) === requestedPostId
              );
              if (targetPost) {
                openCommentsModal(targetPost);
              }
            }
          } catch (error) {
            console.warn('communityChannel warning:', error);
            setChannelPosts([]);
          }
        }
      }
    } catch (error) {
      console.warn('communityOverview error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [
    loadChannelPosts,
    isOfficer,
    route?.params?.channelId,
    route?.params?.postId,
    route?.params?.tab,
  ]);

  useEffect(() => {
    if (
      route?.params?.channelId ||
      route?.params?.postId ||
      route?.params?.tab
    ) {
      fetchCommunityData();
    }
  }, [
    route?.params?.channelId,
    route?.params?.postId,
    route?.params?.tab,
    fetchCommunityData,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchCommunityData();
    }, [fetchCommunityData])
  );

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchPosts(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await operate<{
        channels?: CommunityChannel[];
        posts?: CommunityPost[];
      }>('communitySearch', { query: q.slice(0, 80) });
      if (Array.isArray(res?.channels) && res.channels.length > 0) {
        setChannels(res.channels);
      }
      setSearchPosts(normalizePosts(res?.posts || []));
    } catch (error: any) {
      Alert.alert('Search Error', error?.message || 'Could not search.');
    } finally {
      setIsLoading(false);
    }
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
      await fetchCommunityData();
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
    const nextPrivacy: CommunityPrivacy =
      channel.privacy === 'public' ? 'private' : 'public';
    try {
      await operate('communitySetPrivacy', {
        channelId: channel.id,
        privacy: nextPrivacy,
      });
      await fetchCommunityData();
      Alert.alert(
        'Privacy Updated',
        `Channel is now ${nextPrivacy.toUpperCase()}.`
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not change privacy.');
    }
  };

  const handleRequestJoinPrivate = async (channel: CommunityChannel) => {
    try {
      await operate('communityRequestJoin', { channelId: channel.id });
      await fetchCommunityData();
      Alert.alert(
        'Join Request Sent',
        `Your request to join "${channel.name}" is pending approval by the channel creator.`
      );
    } catch (error: any) {
      Alert.alert(
        'Request Failed',
        error?.message || 'Could not request membership.'
      );
    }
  };

  const handleOpenJoinRequests = async (channel: CommunityChannel) => {
    try {
      const res = await operate<{ requests?: ChannelJoinRequest[] }>(
        'communityJoinRequests',
        { channelId: channel.id }
      );
      setJoinRequests(Array.isArray(res?.requests) ? res.requests : []);
      setIsJoinReqModalVisible(true);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'Could not load channel join requests.'
      );
    }
  };

  const handleReviewJoinRequest = async (
    membershipId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!selectedChannel) return;
    try {
      await operate('communityReviewJoin', {
        channelId: selectedChannel.id,
        membershipId,
        status,
      });
      const res = await operate<{ requests?: ChannelJoinRequest[] }>(
        'communityJoinRequests',
        { channelId: selectedChannel.id }
      );
      setJoinRequests(Array.isArray(res?.requests) ? res.requests : []);
      Alert.alert('Updated', `Membership request ${status}.`);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not review join request.');
    }
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
      setPostImages((prev) => [...prev, result.assets[0]].slice(0, 4));
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
      selectedChannel ||
      channels.find((c) => c.privacy === 'public' || c.canRead) ||
      channels[0] ||
      null;
    if (!targetChannel && !(isOfficer && postKind === 'announcement')) {
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
    try {
      const uploadedIds: string[] = [];
      for (const asset of postImages) {
        const fid = await uploadMediaFile(asset);
        uploadedIds.push(fid);
      }

      if (targetChannel) {
        await operate('communityCreatePost', {
          channelId: targetChannel.id,
          title: formattedTitle,
          body: postBody.trim(),
          imageFileIds: uploadedIds,
          authorRole: isOfficer ? 'officer' : 'owner',
          accountType: isOfficer ? 'officer' : 'owner',
          isOfficial: isOfficialPost,
        });
      }

      if (isOfficialPost) {
        try {
          await operate('communityCreateAnnouncement', {
            title: cleanTitle,
            body: postBody.trim(),
            category: 'announcement',
            audience: 'both',
            priority: 'info',
            barangay: user?.barangay || 'All Barangays',
          });
        } catch {
          // Fallback to local notice refresh if backend stores announcements via channel posts
        }
        const createdNotice: CommunityNotice = {
          id: `notice-${Date.now()}`,
          title: cleanTitle,
          body: postBody.trim(),
          category: 'announcement',
          audience: 'both',
          priority: 'info',
          date: new Date().toISOString(),
          barangay: user?.barangay || 'All Barangays',
          isActive: true,
        };
        setNotices((prev) => [createdNotice, ...prev]);
      }

      setIsCreatePostVisible(false);
      setPostKind('discussion');
      setPostTitle('');
      setPostBody('');
      setPostImages([]);
      if (targetChannel) {
        await loadChannelPosts(targetChannel);
      }
      Alert.alert(
        'Saved successfully',
        isOfficialPost
          ? 'Your official announcement has been published.'
          : 'Your community post has been published.'
      );
    } catch (error: any) {
      Alert.alert('Post Failed', error?.message || 'Could not publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert(
      'Delete Post?',
      'Are you sure you want to delete your discussion post?',
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await operate('communityDeletePost', { postId });
            if (selectedChannel) await loadChannelPosts(selectedChannel);
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not delete post.');
          }
        },
      },
    ]);
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
    try {
      await operate('communityVote', { targetType, targetId, value });
      if (targetType === 'post' && selectedChannel) {
        await loadChannelPosts(selectedChannel);
      } else if (targetType === 'comment' && activePostForComments) {
        await openCommentsModal(activePostForComments);
      }
    } catch (error: any) {
      Alert.alert('Vote Error', error?.message || 'Could not submit vote.');
    }
  };

  const openCommentsModal = async (post: CommunityPost) => {
    setActivePostForComments(post);
    setReplyToCommentId('');
    setLoadingComments(true);
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
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
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
    if (!activePostForComments || !newCommentBody.trim()) return;

    setIsSubmitting(true);
    try {
      await operate('communityCreateComment', {
        postId: activePostForComments.id,
        body: newCommentBody.trim(),
        authorRole: isOfficer ? 'officer' : 'owner',
        accountType: isOfficer ? 'officer' : 'owner',
        ...(replyToCommentId ? { parentCommentId: replyToCommentId } : {}),
      });
      setNewCommentBody('');
      setReplyToCommentId('');
      await openCommentsModal(activePostForComments);
      if (selectedChannel) await loadChannelPosts(selectedChannel);
    } catch (error: any) {
      Alert.alert('Comment Failed', error?.message || 'Could not add comment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activePostForComments) return;
    try {
      await operate('communityDeleteComment', { commentId });
      await openCommentsModal(activePostForComments);
      if (selectedChannel) await loadChannelPosts(selectedChannel);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not delete comment.');
    }
  };

  const displayedPosts = searchPosts !== null ? searchPosts : channelPosts;

  return (
    <View style={styles.container}>
      {/* Read-only notice for unverified Pet Owners */}
      {!isVerifiedOwner && (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyBannerText}>
            👀 Read-Only Mode: Verify your account in Profile &gt; ID Verify to
            create channels, publish posts, comment, and vote.
          </Text>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchBarRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search channels or discussions (2–80 chars)..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={(txt) => {
            setSearchQuery(txt);
            if (!txt.trim()) setSearchPosts(null);
          }}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Responsive 3-Area Switcher (Discussions | Channels | Official CVO Notices) */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'feed' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('feed')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'feed' && styles.segmentTextActive,
            ]}
          >
            💬 Discussions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'channels' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('channels')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'channels' && styles.segmentTextActive,
            ]}
          >
            # Channels ({channels.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'notices' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('notices')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'notices' && styles.segmentTextActive,
            ]}
          >
            📢 CVO Notices ({notices.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchCommunityData}
          />
        }
      >
        {/* AREA 1: DISCUSSIONS FEED */}
        {activeTab === 'feed' && (
          <>
            {/* Horizontal Channel Selector */}
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
                      active && styles.channelChipActive,
                    ]}
                    onPress={() => {
                      setSearchPosts(null);
                      loadChannelPosts(ch);
                    }}
                  >
                    <Text
                      style={[
                        styles.channelChipText,
                        active && styles.channelChipTextActive,
                      ]}
                    >
                      {ch.privacy === 'private' ? '🔒 ' : '# '}
                      {ch.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Active Channel Header & Actions */}
            {selectedChannel && (
              <View style={styles.channelHeaderCard}>
                <View style={styles.channelTitleRow}>
                  <Text style={styles.channelTitle}>
                    {selectedChannel.privacy === 'private' ? '🔒 ' : '# '}
                    {selectedChannel.name}
                  </Text>
                  {isVerifiedOwner &&
                    (selectedChannel.canRead ||
                      selectedChannel.privacy === 'public' ||
                      isOfficer) && (
                      <TouchableOpacity
                        style={styles.newPostBtn}
                        onPress={() => {
                          setPostKind('discussion');
                          setIsCreatePostVisible(true);
                        }}
                      >
                        <Text style={styles.newPostBtnText}>+ New Post</Text>
                      </TouchableOpacity>
                    )}
                </View>
                {selectedChannel.description ? (
                  <Text style={styles.channelDesc}>
                    {selectedChannel.description}
                  </Text>
                ) : null}

                {/* Creator Controls */}
                {selectedChannel.isCreator && (
                  <View style={styles.creatorRow}>
                    <TouchableOpacity
                      style={styles.creatorSmallBtn}
                      onPress={() =>
                        handleToggleChannelPrivacy(selectedChannel)
                      }
                    >
                      <Text style={styles.creatorSmallBtnText}>
                        Switch to{' '}
                        {selectedChannel.privacy === 'public'
                          ? 'Private'
                          : 'Public'}
                      </Text>
                    </TouchableOpacity>
                    {selectedChannel.privacy === 'private' && (
                      <TouchableOpacity
                        style={styles.creatorSmallBtn}
                        onPress={() => handleOpenJoinRequests(selectedChannel)}
                      >
                        <Text style={styles.creatorSmallBtnText}>
                          Review Join Requests
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Non-member Private Channel Gate */}
                {selectedChannel.privacy === 'private' &&
                  !selectedChannel.canRead && (
                    <View style={styles.privateGateBox}>
                      <Text style={styles.privateGateText}>
                        This is a private channel. Request membership from the
                        channel creator to view posts and attachments.
                      </Text>
                      {selectedChannel.membership === 'pending' ? (
                        <Text style={styles.pendingMembershipText}>
                          ⏳ Membership Request Pending Creator Approval
                        </Text>
                      ) : (
                        <TouchableOpacity
                          style={styles.joinBtn}
                          onPress={() =>
                            handleRequestJoinPrivate(selectedChannel)
                          }
                        >
                          <Text style={styles.joinBtnText}>
                            Request to Join Private Channel
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
              </View>
            )}

            {/* Posts List */}
            {displayedPosts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No Discussions Yet</Text>
                <Text style={styles.emptySub}>
                  Select a public channel or tap "+ New Post" to start a
                  conversation.
                </Text>
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
                return (
                  <View key={post.id} style={styles.postCard}>
                    <View style={styles.postHeader}>
                      <View style={styles.authorMetaRow}>
                        <Text style={styles.postAuthor}>
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
                        <Text style={styles.postAuthor}>
                          • {new Date(post.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      {isAuthor && (
                        <TouchableOpacity
                          onPress={() => handleDeletePost(post.id)}
                        >
                          <Text style={styles.deleteText}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={styles.postTitle}>{post.title}</Text>
                    <Text style={styles.postBody}>{post.body}</Text>

                    {/* Private Storage Images via 5-Min Signed Token (`communityImageToken`) */}
                    {imageIds.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginVertical: 10 }}
                      >
                        {imageIds.map((fid) => (
                          <SignedCommunityImage
                            key={`${post.id}-${fid}`}
                            postId={post.id}
                            fileId={fid}
                            styles={styles}
                          />
                        ))}
                      </ScrollView>
                    )}

                    {/* Vote & Comment Bar */}
                    <View style={styles.postFooter}>
                      <View style={styles.voteGroup}>
                        <TouchableOpacity
                          style={[
                            styles.voteBtn,
                            post.myVote === 1 && styles.voteBtnUpActive,
                          ]}
                          onPress={() => handleVote('post', post.id, 1)}
                        >
                          <Text style={styles.voteBtnText}>
                            ▲ {post.upvotes ?? 0}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.scoreText}>
                          Score: {post.score ?? 0}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.voteBtn,
                            post.myVote === -1 && styles.voteBtnDownActive,
                          ]}
                          onPress={() => handleVote('post', post.id, -1)}
                        >
                          <Text style={styles.voteBtnText}>
                            ▼ {post.downvotes ?? 0}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.commentBtn}
                        onPress={() => openCommentsModal(post)}
                      >
                        <Text style={styles.commentBtnText}>
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
                style={styles.createChannelBtn}
                onPress={() => setIsCreateChannelVisible(true)}
              >
                <Text style={styles.createChannelBtnText}>
                  + Create New Community Channel (Max 10)
                </Text>
              </TouchableOpacity>
            )}

            {channels.map((ch) => (
              <View key={ch.id} style={styles.postCard}>
                <View style={styles.channelTitleRow}>
                  <Text style={styles.postTitle}>
                    {ch.privacy === 'private' ? '🔒 ' : '# '}
                    {ch.name}
                  </Text>
                  <Text style={styles.privacyBadge}>
                    {ch.privacy.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.postBody}>
                  {ch.description || 'Iligan Pet Owner Community Channel'}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 10,
                  }}
                >
                  <Text style={styles.postAuthor}>
                    Status: {ch.canRead ? 'Accessible' : ch.membership}
                  </Text>
                  <TouchableOpacity
                    style={styles.newPostBtn}
                    onPress={() => {
                      setActiveTab('feed');
                      loadChannelPosts(ch);
                    }}
                  >
                    <Text style={styles.newPostBtnText}>Open Channel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* AREA 3: OFFICIAL CVO OWNER NOTICES & OUTBREAK ALERTS (`communityOfficialNotices`) */}
        {activeTab === 'notices' && (
          <>
            <View style={styles.officialHeaderBanner}>
              <Text style={styles.officialHeaderTitle}>
                🏛️ Official Iligan City Veterinary Office Notices
              </Text>
              <Text style={styles.officialHeaderSub}>
                Displays official CVO owner-directed outbreak advisories and
                public announcements.
              </Text>
              {isOfficer && (
                <TouchableOpacity
                  style={[
                    styles.newPostBtn,
                    { alignSelf: 'flex-start', marginTop: 10 },
                  ]}
                  onPress={() => {
                    setPostKind('announcement');
                    setIsCreatePostVisible(true);
                  }}
                >
                  <Text style={styles.newPostBtnText}>
                    + New Official Announcement
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {notices.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  No Active CVO Owner Notices
                </Text>
                <Text style={styles.emptySub}>
                  Official outbreak alerts shared with pet owners and CVO
                  announcements will appear here.
                </Text>
              </View>
            ) : (
              notices.map((n) => (
                <View
                  key={n.id}
                  style={[
                    styles.noticeCard,
                    n.category === 'outbreak' && styles.noticeCardOutbreak,
                  ]}
                >
                  <View style={styles.channelTitleRow}>
                    <Text style={styles.cvoBadge}>
                      ✓ CVO OFFICIAL • {String(n.category).toUpperCase()}
                    </Text>
                    <Text style={styles.noticePriority}>
                      Priority: {String(n.priority || 'info').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.postTitle}>{n.title}</Text>
                  {n.barangay ? (
                    <Text style={styles.noticeBrgy}>
                      📍 Barangay: {n.barangay}
                    </Text>
                  ) : null}
                  <Text style={styles.postBody}>{n.body}</Text>
                  <Text style={[styles.postAuthor, { marginTop: 6 }]}>
                    Published: {new Date(n.date).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Modal 1: Create Channel (`communityCreateChannel`) */}
      <Modal
        visible={isCreateChannelVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCreateChannelVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Create Community Channel</Text>
              <Text style={styles.fieldLabel}>Channel Name (1–80 chars) *</Text>
              <TextInput
                style={styles.input}
                maxLength={80}
                value={newChannelName}
                onChangeText={setNewChannelName}
                placeholder="e.g. Iligan Cat Owners Club"
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.fieldLabel}>
                Description (0–300 chars, optional)
              </Text>
              <TextInput
                style={[styles.input, { height: 70 }]}
                maxLength={300}
                multiline
                value={newChannelDesc}
                onChangeText={setNewChannelDesc}
                placeholder="What is this channel about?"
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.fieldLabel}>Channel Privacy</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {(['public', 'private'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.privacyChoice,
                      newChannelPrivacy === p && styles.privacyChoiceActive,
                    ]}
                    onPress={() => setNewChannelPrivacy(p)}
                  >
                    <Text
                      style={[
                        styles.privacyChoiceText,
                        newChannelPrivacy === p &&
                          styles.privacyChoiceTextActive,
                      ]}
                    >
                      {p === 'public' ? '🌐 Public' : '🔒 Private (Approval)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsCreateChannelVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreateChannel}
                  disabled={isSubmitting}
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
        onRequestClose={() => setIsCreatePostVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                {isOfficer && postKind === 'announcement'
                  ? 'Publish Official CVO Announcement'
                  : `Post in #${selectedChannel?.name || 'Community'}`}
              </Text>
              {isOfficer && (
                <>
                  <Text style={styles.fieldLabel}>Post Type</Text>
                  <View
                    style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}
                  >
                    {(['discussion', 'announcement'] as const).map((kind) => (
                      <TouchableOpacity
                        key={kind}
                        style={[
                          styles.privacyChoice,
                          postKind === kind && styles.privacyChoiceActive,
                        ]}
                        onPress={() => setPostKind(kind)}
                      >
                        <Text
                          style={[
                            styles.privacyChoiceText,
                            postKind === kind &&
                              styles.privacyChoiceTextActive,
                          ]}
                        >
                          {kind === 'discussion'
                            ? '💬 Discussion Post'
                            : '📢 Official Announcement'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.fieldLabel}>Title (1–140 chars) *</Text>
              <TextInput
                style={styles.input}
                maxLength={140}
                value={postTitle}
                onChangeText={setPostTitle}
                placeholder="Discussion title..."
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.fieldLabel}>Body (1–5000 chars) *</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                maxLength={5000}
                multiline
                value={postBody}
                onChangeText={setPostBody}
                placeholder="Write your discussion..."
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handlePickPostImage}
              >
                <Text style={styles.attachBtnText}>
                  📷 Attach Private Image ({postImages.length}/4 selected)
                </Text>
              </TouchableOpacity>

              {postImages.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                >
                  {postImages.map((img, idx) => (
                    <View key={idx} style={{ marginRight: 8 }}>
                      <Image
                        source={{ uri: img.uri }}
                        style={{ width: 64, height: 64, borderRadius: 8 }}
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setPostImages((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <Text
                          style={{
                            color: '#D9534F',
                            fontSize: 11,
                            textAlign: 'center',
                            marginTop: 2,
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
                  style={styles.cancelBtn}
                  onPress={() => setIsCreatePostVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreatePost}
                  disabled={isSubmitting}
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
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>
              Comments: {activePostForComments?.title}
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320, marginVertical: 10 }}
            >
              {loadingComments ? (
                <ActivityIndicator color="#00AEEF" />
              ) : comments.length === 0 ? (
                <Text style={styles.emptySub}>No comments yet.</Text>
              ) : (
                comments.map((c) => {
                  const isMyComment =
                    user?.id && String(c.authorId) === String(user.id);
                  const isOfficialCommentAuthor = isOfficialStaffAuthor(
                    c,
                    user?.id,
                    isOfficer
                  );
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.commentItem,
                        c.parentCommentId ? { marginLeft: 18 } : null,
                      ]}
                    >
                      <View style={styles.postHeader}>
                        <View style={styles.authorMetaRow}>
                          <Text style={styles.postAuthor}>
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
                          <Text style={styles.postAuthor}>
                            • {new Date(c.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        {isMyComment && (
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(c.id)}
                          >
                            <Text style={styles.deleteText}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.postBody}>{c.body}</Text>
                      <View style={styles.commentActions}>
                        <TouchableOpacity
                          onPress={() => handleVote('comment', c.id, 1)}
                        >
                          <Text style={styles.voteSmall}>
                            ▲ {c.upvotes ?? 0}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleVote('comment', c.id, -1)}
                        >
                          <Text style={styles.voteSmall}>
                            ▼ {c.downvotes ?? 0}
                          </Text>
                        </TouchableOpacity>
                        {isVerifiedOwner && (
                          <TouchableOpacity
                            onPress={() => setReplyToCommentId(c.id)}
                          >
                            <Text style={styles.replyLink}>Reply</Text>
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
                {replyToCommentId ? (
                  <TouchableOpacity onPress={() => setReplyToCommentId('')}>
                    <Text style={styles.replyingBanner}>
                      Replying to comment #{replyToCommentId.slice(0, 6)} (Tap
                      to cancel)
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TextInput
                  style={styles.input}
                  placeholder="Write a comment..."
                  placeholderTextColor="#94A3B8"
                  value={newCommentBody}
                  onChangeText={setNewCommentBody}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setActivePostForComments(null)}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              {isVerifiedOwner && (
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddComment}
                  disabled={isSubmitting}
                >
                  <Text style={styles.submitBtnText}>Post Comment</Text>
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
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pending Private Join Requests</Text>
            {joinRequests.length === 0 ? (
              <Text style={[styles.emptySub, { marginVertical: 14 }]}>
                No pending requests for this channel.
              </Text>
            ) : (
              joinRequests.map((req) => (
                <View key={req.id} style={styles.commentItem}>
                  <Text style={styles.postTitle}>{req.userName}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { borderColor: '#D9534F' }]}
                      onPress={() => handleReviewJoinRequest(req.id, 'rejected')}
                    >
                      <Text style={{ color: '#D9534F', fontWeight: 'bold' }}>
                        Reject
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.submitBtn, { backgroundColor: '#16A34A' }]}
                      onPress={() => handleReviewJoinRequest(req.id, 'approved')}
                    >
                      <Text style={styles.submitBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 12 }]}
              onPress={() => setIsJoinReqModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  readOnlyBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F59E0B',
  },
  readOnlyBannerText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
  searchBarRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  searchBtn: {
    backgroundColor: '#00AEEF',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: '#00AEEF' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  segmentTextActive: { color: '#FFFFFF' },
  scrollContent: { padding: 14, paddingBottom: 60 },
  channelChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginRight: 8,
  },
  channelChipActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
  channelChipText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
  channelChipTextActive: { color: '#FFFFFF' },
  channelHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  channelDesc: { fontSize: 12, color: '#64748B', marginTop: 4 },
  newPostBtn: {
    backgroundColor: '#00AEEF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  newPostBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  creatorRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  creatorSmallBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  creatorSmallBtnText: { fontSize: 11, fontWeight: 'bold', color: '#0284C7' },
  privateGateBox: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  privateGateText: { fontSize: 12, color: '#92400E', marginBottom: 8 },
  pendingMembershipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  joinBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  joinBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#00AEEF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  officialAuthorBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  postAuthor: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  deleteText: { fontSize: 11, color: '#D9534F', fontWeight: 'bold' },
  postTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  postBody: { fontSize: 13, color: '#334155', lineHeight: 19 },
  imageTokenPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    padding: 6,
  },
  postAttachedImage: {
    width: 140,
    height: 140,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#E2E8F0',
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  voteGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voteBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  voteBtnUpActive: { backgroundColor: '#DCFCE7' },
  voteBtnDownActive: { backgroundColor: '#FEE2E2' },
  voteBtnText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
  scoreText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  commentBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  commentBtnText: { fontSize: 12, fontWeight: 'bold', color: '#0284C7' },
  createChannelBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#16A34A',
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  createChannelBtnText: { color: '#15803D', fontSize: 13, fontWeight: 'bold' },
  privacyBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  officialHeaderBanner: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  officialHeaderTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  officialHeaderSub: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  noticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderLeftWidth: 5,
    borderLeftColor: '#0284C7',
  },
  noticeCardOutbreak: {
    borderColor: '#FCA5A5',
    borderLeftColor: '#EF4444',
  },
  cvoBadge: { fontSize: 11, fontWeight: 'bold', color: '#0284C7' },
  noticePriority: { fontSize: 11, fontWeight: 'bold', color: '#B45309' },
  noticeBrgy: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
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
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  privacyChoice: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    alignItems: 'center',
  },
  privacyChoiceActive: { backgroundColor: '#E0F2FE', borderColor: '#00AEEF' },
  privacyChoiceText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  privacyChoiceTextActive: { color: '#0284C7', fontWeight: 'bold' },
  attachBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  attachBtnText: { fontSize: 12, fontWeight: 'bold', color: '#0284C7' },
  commentItem: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  commentActions: { flexDirection: 'row', gap: 14, marginTop: 6 },
  voteSmall: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
  replyLink: { fontSize: 12, fontWeight: 'bold', color: '#0284C7' },
  replyingBanner: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#64748B', fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});