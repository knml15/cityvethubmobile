import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CallButton from '../../components/CallButton';
import { useAppPalette, useThemedStyles } from '../../theme';
import { useLiveSync } from '../../utils/useLiveSync';
import { useAuthStore, useAdoptionStore } from '../../store/index';
import { operate } from '../../api/client';

const MAX_REASON_LENGTH = 1000;

function formatDisplayDate(raw?: string): string {
  if (!raw) return 'Recorded';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === 'recorded') return 'Recorded';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHousingLabel(housingRequirement?: string): string {
  const req = String(housingRequirement || 'any').toLowerCase();
  if (req === 'apartment') return '🏢 Apartment Friendly';
  if (req === 'house') return '🏠 House Required';
  if (req === 'yard') return '🌳 Yard Required';
  return '🏡 Any Housing';
}

export default function PetDetailScreen() {
  const styles = useThemedStyles(baseStyles);
  const palette = useAppPalette();
  const isDark = useAuthStore((s) => s.user?.theme === 'dark');
  const user = useAuthStore((s) => s.user);

  const route = useRoute();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    availablePets,
    myApplications,
    incomingApplications,
    submitApplication,
    fetchAvailablePets,
    fetchMyApplications,
    fetchIncomingApplications,
    reviewApplication,
    confirmTransfer,
    toggleListingVisibility,
  } = useAdoptionStore();

  const params = route.params as any;
  const rawPet = params?.pet || {};
  const targetListingId = String(rawPet.listingId || rawPet.id || '1');

  // UX #1: Track live store updates instead of staying frozen on route.params
  const liveListing = useMemo(
    () =>
      availablePets.find(
        (item) => String(item.listingId || item.id) === targetListingId
      ),
    [availablePets, targetListingId]
  );

  // Optimistic local visibility tracking for owners toggling Hide / Restore
  const [localIsActive, setLocalIsActive] = useState<boolean | null>(
    typeof rawPet.isActive === 'boolean' ? rawPet.isActive : null
  );
  const [localStatusOverride, setLocalStatusOverride] = useState<string | null>(
    null
  );

  const effectiveIsActive =
    localIsActive !== null
      ? localIsActive
      : liveListing
      ? liveListing.isActive !== false
      : rawPet.isActive !== false;

  const isListingHiddenOrRemoved = useMemo(() => {
    if (localIsActive === false) return true;
    if (availablePets.length > 0 && !liveListing && localIsActive !== true) {
      return true;
    }
    return false;
  }, [availablePets.length, liveListing, localIsActive]);

  const pet = useMemo(() => {
    if (liveListing?.registered_pet) {
      const rp = liveListing.registered_pet;
      const housingTag = formatHousingLabel(liveListing.housingRequirement);
      const rawSpecies = String(rp.species || 'DOG').toUpperCase();
      return {
        id: String(liveListing.id),
        listingId: String(liveListing.listingId || liveListing.id),
        petId: String(liveListing.petId || rp.id),
        petProfileId: String(
          liveListing.petProfileId || liveListing.petId || rp.id
        ),
        postedById: liveListing.postedById || rawPet.postedById,
        title: liveListing.title || rp.name || 'Companion',
        name: rp.name || 'Companion',
        species:
          rawSpecies === 'CAT' ? 'Cat' : rawSpecies === 'DOG' ? 'Dog' : 'Pet',
        breed: rp.breed || 'Aspin',
        age: rp.ageYears !== undefined ? `${rp.ageYears} yr(s)` : '1 yr(s)',
        gender: rp.gender === 'FEMALE' ? 'Female' : 'Male',
        barangay: rp.barangay || 'Poblacion',
        controlNumber: rp.registration_number || 'QR-PASSPORT',
        status: String(
          localStatusOverride || liveListing.status || 'AVAILABLE'
        ).toUpperCase(),
        ownerDisplayName: liveListing.ownerDisplayName || 'Pet Owner',
        ownerAvatarUrl: liveListing.ownerAvatarUrl,
        verificationStatus: liveListing.verificationStatus || 'draft',
        housingRequirement: liveListing.housingRequirement || 'any',
        photoFileId: rp.photoFileId,
        photoUrl:
          rp.photo ||
          rawPet.photoUrl ||
          'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
        description:
          liveListing.adoption_reason ||
          'Companion animal listed for peer-to-peer adoption in Iligan City.',
        healthClearance:
          liveListing.requirements || 'Responsible adopter required.',
        temperament: [housingTag],
        vaccinations: (rp.vaccinations || []).map((v: any) => ({
          vaccine: v.vaccine_name || 'Vaccination',
          dateAdministered: v.administered_date || 'Recorded',
          administeringVet: v.administered_by || 'CVO Officer',
        })),
      };
    }

    return {
      id: String(rawPet.id || '1'),
      listingId: targetListingId,
      petId: String(rawPet.petId || rawPet.id || '1'),
      petProfileId: String(rawPet.petProfileId || rawPet.petId || '1'),
      postedById: rawPet.postedById,
      title: rawPet.title || rawPet.name || 'Companion',
      name: rawPet.name || 'Companion',
      species: rawPet.species || 'Dog',
      breed: rawPet.breed || 'Aspin',
      age: rawPet.age || '1 yr(s)',
      gender: rawPet.gender || 'Male',
      barangay: rawPet.barangay || 'Poblacion',
      controlNumber: rawPet.controlNumber || 'QR-PASSPORT',
      status: String(
        localStatusOverride || rawPet.status || 'AVAILABLE'
      ).toUpperCase(),
      ownerDisplayName: rawPet.ownerDisplayName || 'Pet Owner',
      ownerAvatarUrl: rawPet.ownerAvatarUrl,
      verificationStatus: rawPet.verificationStatus || 'draft',
      housingRequirement: rawPet.housingRequirement || 'any',
      photoFileId: rawPet.photoFileId,
      photoUrl:
        rawPet.photoUrl ||
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
      description:
        rawPet.description ||
        'Companion animal listed for peer-to-peer adoption in Iligan City.',
      healthClearance:
        rawPet.healthClearance || 'Responsible adopter required.',
      temperament: Array.isArray(rawPet.temperament) ? rawPet.temperament : [],
      vaccinations: Array.isArray(rawPet.vaccinations)
        ? rawPet.vaccinations
        : [],
    };
  }, [liveListing, rawPet, targetListingId, localStatusOverride]);

  const isOwnerOfListing = Boolean(
    params?.isOwned ||
      (user?.id &&
        pet.postedById &&
        String(pet.postedById) === String(user.id))
  );
  const isOfficer = user?.contractRole === 'officer';

  // Semantic dark/light adaptive palette helpers
  const semanticTones = useMemo(
    () => ({
      availableBg: isDark ? 'rgba(34, 197, 94, 0.18)' : '#DCFCE7',
      availableText: isDark ? '#4ADE80' : '#166534',
      reservedBg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
      reservedText: isDark ? '#FBBF24' : '#B45309',
      declinedBg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
      declinedText: palette.danger,
      adoptedBg: isDark ? palette.surfaceMuted : '#E2E8F0',
      adoptedText: palette.secondary,
      infoBorder: isDark ? palette.border : '#BAE6FD',
      successBannerBg: isDark ? 'rgba(34, 197, 94, 0.12)' : '#F0FDF4',
      successBannerBorder: isDark ? '#4ADE80' : '#22C55E',
      successBannerText: isDark ? '#86EFAC' : '#15803D',
      warningBannerBg: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
      warningBannerBorder: isDark ? 'rgba(251, 191, 36, 0.35)' : '#FDE68A',
      warningBannerText: isDark ? '#FDE68A' : '#92400E',
    }),
    [isDark, palette]
  );

  // Apply to Adopt Modal State (`applyAdoption`)
  const [modalVisible, setModalVisible] = useState(false);
  const [adopterContact, setAdopterContact] = useState<string>(
    user?.contactNumber || ''
  );
  const [adoptionReason, setAdoptionReason] = useState<string>('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);

  // Owner Photo Sharing Modal State (`updateListingPhotos`)
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(
    Boolean(pet.ownerAvatarUrl)
  );
  const [isUpdatingPhotos, setIsUpdatingPhotos] = useState(false);

  // Per-action loading & initial fetch states
  const [isFetchingApps, setIsFetchingApps] = useState(false);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    'approve' | 'decline' | 'handover' | null
  >(null);
  const [isTogglingListing, setIsTogglingListing] = useState(false);

  // Sync user's default contact number if it wasn't loaded on mount
  useEffect(() => {
    if (user?.contactNumber && !modalVisible) {
      setAdopterContact((prev) => prev || user.contactNumber || '');
    }
  }, [user?.contactNumber, modalVisible]);

  // Load initial applications quietly with localized spinner (owner) or check existing application (adopter)
  useEffect(() => {
    let mounted = true;
    if (isOwnerOfListing) {
      setIsFetchingApps(true);
      fetchIncomingApplications(true).finally(() => {
        if (mounted) setIsFetchingApps(false);
      });
    } else if (!isOfficer) {
      fetchMyApplications(true);
    }
    return () => {
      mounted = false;
    };
  }, [
    isOwnerOfListing,
    isOfficer,
    fetchIncomingApplications,
    fetchMyApplications,
  ]);

  useLiveSync(
    () => {
      fetchAvailablePets(true);
      if (isOwnerOfListing) {
        fetchIncomingApplications(true);
      } else if (!isOfficer) {
        fetchMyApplications(true);
      }
    },
    { enabled: !modalVisible && !photoModalVisible }
  );

  const listingApplications = useMemo(
    () =>
      incomingApplications.filter(
        (app) => String(app.listingId) === String(pet.listingId)
      ),
    [incomingApplications, pet.listingId]
  );

  // UX #2: Match existing outgoing application for duplicate prevention
  const existingApplication = useMemo(
    () =>
      myApplications.find(
        (app) => String(app.listingId) === String(pet.listingId)
      ),
    [myApplications, pet.listingId]
  );
  const existingAppStatus = existingApplication
    ? String(existingApplication.status || 'PENDING').toUpperCase()
    : null;
  const hasBlockingApplication = Boolean(
    existingAppStatus &&
      !['DECLINED', 'REJECTED', 'CANCELLED'].includes(existingAppStatus)
  );

  const openApplyModal = useCallback(() => {
    setContactError(null);
    setReasonError(null);
    if (!adopterContact && user?.contactNumber) {
      setAdopterContact(user.contactNumber);
    }
    setModalVisible(true);
  }, [adopterContact, user?.contactNumber]);

  const openPhotoModal = useCallback(() => {
    const hasCustomPetPhoto =
      Boolean(pet.photoFileId) ||
      !String(pet.photoUrl || '').includes('images.unsplash.com');
    setPublishPetPhoto(hasCustomPetPhoto);
    setPublishOwnerPhoto(Boolean(pet.ownerAvatarUrl));
    setPhotoModalVisible(true);
  }, [pet.photoFileId, pet.photoUrl, pet.ownerAvatarUrl]);

  const handleSharePassportId = useCallback(async () => {
    try {
      await Share.share({
        message: `${pet.name} • CityVetHub Passport ID: ${pet.controlNumber}`,
      });
    } catch {
      // Ignore cancelled share sheet
    }
  }, [pet.name, pet.controlNumber]);

  const handleSubmitApplication = async () => {
    const cleanPhone = adopterContact.trim();
    const cleanReason = adoptionReason.trim();
    const phoneRegex = /^[+0-9 ()-]{7,40}$/;

    let valid = true;
    if (!phoneRegex.test(cleanPhone)) {
      setContactError(
        'Enter a valid contact number (7–40 digits, e.g. 09171234567).'
      );
      valid = false;
    } else {
      setContactError(null);
    }

    if (!cleanReason) {
      setReasonError(
        'Please share why you would like to adopt and describe your home setup.'
      );
      valid = false;
    } else {
      setReasonError(null);
    }

    if (!valid || isSubmittingApp) return;

    setIsSubmittingApp(true);
    try {
      await submitApplication({
        listingId: pet.listingId,
        pet: pet.petId,
        contactNumber: cleanPhone,
        contact_number: cleanPhone,
        message: cleanReason,
        reason_for_adoption: cleanReason,
        address: `Brgy. ${user?.barangay || 'Poblacion'}, Iligan City`,
        status: 'PENDING',
      });

      setModalVisible(false);
      setAdoptionReason('');
      fetchMyApplications(true);

      Alert.alert(
        'Application Sent to Pet Owner!',
        `Your application for ${pet.name} has been sent directly to ${pet.ownerDisplayName}. You can track their decision in your Profile > Adoptions tab.`
      );
    } catch (error: any) {
      Alert.alert(
        'Application Failed',
        error?.message || 'Could not submit your adoption application.'
      );
    } finally {
      setIsSubmittingApp(false);
    }
  };

  const handleUpdateListingPhotos = async () => {
    if (isUpdatingPhotos) return;
    setIsUpdatingPhotos(true);
    try {
      await operate('updateListingPhotos', {
        listingId: pet.listingId,
        publishPetPhoto,
        publishOwnerPhoto,
      });
      await fetchAvailablePets(true);
      setPhotoModalVisible(false);
      Alert.alert(
        'Saved successfully',
        'Your photo-sharing preferences for this listing have been updated.'
      );
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.message || 'Could not update listing photo preferences.'
      );
    } finally {
      setIsUpdatingPhotos(false);
    }
  };

  const handleToggleListing = () => {
    if (isTogglingListing) return;
    const currentlyActive = effectiveIsActive;
    Alert.alert(
      currentlyActive ? 'Hide Listing from Feed?' : 'Restore Listing to Feed?',
      currentlyActive
        ? `Hide ${pet.name} from the public adoption feed? You can restore it later.`
        : `Make ${pet.name} visible again on the public adoption feed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: currentlyActive ? 'Hide Listing' : 'Restore Listing',
          onPress: async () => {
            setIsTogglingListing(true);
            try {
              await toggleListingVisibility(pet.listingId);
              setLocalIsActive(!currentlyActive);
              Alert.alert(
                currentlyActive ? 'Listing Hidden' : 'Listing Restored',
                currentlyActive
                  ? `${pet.name} is now hidden from the public adoption feed.`
                  : `${pet.name} is now visible on the public adoption feed.`
              );
            } catch (error: any) {
              Alert.alert(
                'Error',
                error?.message || 'Could not toggle listing visibility.'
              );
            } finally {
              setIsTogglingListing(false);
            }
          },
        },
      ]
    );
  };

  const handleOwnerDecision = (
    appId: string,
    applicantName: string,
    decision: 'approve' | 'decline'
  ) => {
    if (busyAppId) return;
    Alert.alert(
      decision === 'approve' ? 'Approve Application?' : 'Decline Application?',
      decision === 'approve'
        ? `Approve ${applicantName}? This reserves your listing immediately without needing CVO approval.`
        : `Decline ${applicantName}'s application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approve' ? 'Approve' : 'Decline',
          style: decision === 'decline' ? 'destructive' : 'default',
          onPress: async () => {
            setBusyAppId(appId);
            setBusyAction(decision);
            try {
              await reviewApplication(appId, decision);
              if (decision === 'approve') {
                setLocalStatusOverride('RESERVED');
              }
              Alert.alert(
                'Updated',
                decision === 'approve'
                  ? `Approved ${applicantName} and reserved ${pet.name}.`
                  : `Declined ${applicantName}'s application.`
              );
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Action failed.');
            } finally {
              setBusyAppId(null);
              setBusyAction(null);
            }
          },
        },
      ]
    );
  };

  const handleOwnerConfirmTransfer = (appId: string, applicantName: string) => {
    if (busyAppId) return;
    Alert.alert(
      'Confirm Final Handover?',
      `Confirm that ${pet.name} has been physically handed over to ${applicantName}? Ownership of this pet, its QR passport, and medical records will automatically transfer to ${applicantName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          onPress: async () => {
            setBusyAppId(appId);
            setBusyAction('handover');
            try {
              await confirmTransfer(appId);
              setLocalStatusOverride('ADOPTED');
              Alert.alert(
                'Transfer Complete!',
                `Ownership of ${pet.name} has been transferred to ${applicantName}.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (err: any) {
              Alert.alert(
                'Transfer Failed',
                err?.message || 'Could not complete handover.'
              );
            } finally {
              setBusyAppId(null);
              setBusyAction(null);
            }
          },
        },
      ]
    );
  };

  const isReserved = pet.status === 'RESERVED';
  const isAdopted = pet.status === 'ADOPTED';

  const heroStatusStyle = isReserved
    ? { bg: semanticTones.reservedBg, text: semanticTones.reservedText }
    : isAdopted
    ? { bg: semanticTones.adoptedBg, text: semanticTones.adoptedText }
    : { bg: semanticTones.availableBg, text: semanticTones.availableText };

  const getAppBadgeTone = (status: string) => {
    if (status === 'APPROVED' || status === 'OWNER_APPROVED') {
      return { bg: semanticTones.availableBg, text: semanticTones.availableText };
    }
    if (
      status === 'DECLINED' ||
      status === 'REJECTED' ||
      status === 'CANCELLED'
    ) {
      return { bg: semanticTones.declinedBg, text: semanticTones.declinedText };
    }
    return { bg: semanticTones.reservedBg, text: semanticTones.reservedText };
  };

  const ownerInitial = (pet.ownerDisplayName || 'P').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 116 + insets.bottom },
        ]}
      >
        {/* Hero Photo with Pill Floating Badges */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: pet.photoUrl }}
            style={styles.petImage}
            resizeMode="cover"
          />

          {/* Floating CVO Verified Badge (Top Left) */}
          {pet.verificationStatus === 'verified' && (
            <View style={styles.floatingVerifiedBadge}>
              <Text style={styles.floatingVerifiedText}>✓ CVO Verified</Text>
            </View>
          )}

          {/* Floating Status Badge (Top Right) */}
          <View
            style={[
              styles.floatingStatusBadge,
              { backgroundColor: heroStatusStyle.bg },
            ]}
          >
            <Text
              style={[
                styles.floatingStatusText,
                { color: heroStatusStyle.text },
              ]}
            >
              {pet.status}
            </Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          {/* Pet Overview Card */}
          <View style={styles.cardSection}>
            <Text style={styles.petName}>{pet.title}</Text>

            {/* Owner Identity Row (with consented avatar or monogram fallback) */}
            <View style={styles.ownerRow}>
              {pet.ownerAvatarUrl ? (
                <Image
                  source={{ uri: pet.ownerAvatarUrl }}
                  style={[styles.ownerAvatar, { borderColor: palette.border }]}
                />
              ) : (
                <View
                  style={[
                    styles.ownerAvatarFallback,
                    { backgroundColor: palette.primaryMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.ownerAvatarInitial,
                      { color: palette.primary },
                    ]}
                  >
                    {ownerInitial}
                  </Text>
                </View>
              )}
              <Text style={styles.ownerSubText} numberOfLines={1}>
                Listed by{' '}
                <Text style={{ fontWeight: '700', color: palette.text }}>
                  {isOwnerOfListing ? 'You' : pet.ownerDisplayName}
                </Text>
              </Text>
            </View>

            {/* Quick Stats 2x2 Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>SPECIES & BREED</Text>
                <Text style={styles.statValue} numberOfLines={2}>
                  {pet.species} • {pet.breed}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>GENDER</Text>
                <Text style={styles.statValue}>
                  {pet.gender === 'Female' ? '♀ Female' : '♂ Male'}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>AGE</Text>
                <Text style={styles.statValue}>🎂 {pet.age}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>LOCATION</Text>
                <Text style={styles.statValue} numberOfLines={2}>
                  📍 Brgy. {pet.barangay}
                </Text>
              </View>
            </View>

            {/* Interactive Digital Passport Token Box */}
            <TouchableOpacity
              style={[
                styles.tokenBox,
                {
                  backgroundColor: palette.primaryMuted,
                  borderColor: semanticTones.infoBorder,
                },
              ]}
              onPress={handleSharePassportId}
              activeOpacity={0.75}
            >
              <View style={styles.tokenLabelRow}>
                <Text style={{ fontSize: 14 }}>📱</Text>
                <Text
                  style={[styles.tokenLabel, { color: palette.primary }]}
                  numberOfLines={1}
                >
                  {pet.verificationStatus === 'verified'
                    ? 'Official CVO Passport'
                    : 'Digital Pet Passport ID'}
                </Text>
              </View>
              <View style={styles.tokenValueRow}>
                <Text
                  style={[styles.tokenValue, { color: palette.primary }]}
                  selectable
                  numberOfLines={1}
                >
                  {pet.controlNumber}
                </Text>
                <Text style={[styles.tokenShareHint, { color: palette.secondary }]}>
                  📤
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Owner Controls if viewing own listing */}
          {isOwnerOfListing && (
            <View
              style={[
                styles.ownerControlCard,
                { borderColor: semanticTones.infoBorder },
              ]}
            >
              <Text style={styles.sectionTitle}>⚙️ Manage My Listing</Text>

              {!effectiveIsActive && (
                <View
                  style={[
                    styles.hiddenNoticeBanner,
                    {
                      backgroundColor: semanticTones.warningBannerBg,
                      borderColor: semanticTones.warningBannerBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.hiddenNoticeText,
                      { color: semanticTones.warningBannerText },
                    ]}
                  >
                    🙈 Listing is currently hidden from the public adoption feed.
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.ownerBtn,
                    { borderColor: palette.primary },
                  ]}
                  onPress={openPhotoModal}
                  activeOpacity={0.8}
                  disabled={isTogglingListing}
                >
                  <Text style={[styles.ownerBtnText, { color: palette.primary }]}>
                    📷 Photo Consent
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.ownerBtn,
                    { borderColor: palette.border },
                  ]}
                  onPress={handleToggleListing}
                  activeOpacity={0.8}
                  disabled={isTogglingListing}
                >
                  {isTogglingListing ? (
                    <ActivityIndicator size="small" color={palette.secondary} />
                  ) : (
                    <Text
                      style={[
                        styles.ownerBtnText,
                        { color: palette.secondary },
                      ]}
                    >
                      {effectiveIsActive ? '🙈 Hide Listing' : '👁️ Restore Listing'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 18, marginBottom: 10 }]}>
                Received Applications ({listingApplications.length})
              </Text>

              {isFetchingApps && listingApplications.length === 0 ? (
                <View style={styles.emptyAppsBox}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={[styles.emptyAppsText, { marginTop: 8 }]}>
                    Loading applications...
                  </Text>
                </View>
              ) : listingApplications.length === 0 ? (
                <View style={styles.emptyAppsBox}>
                  <Text style={styles.emptyAppsText}>
                    No applications received for this listing yet.
                  </Text>
                </View>
              ) : (
                listingApplications.map((app) => {
                  const appId = String(app.id);
                  const st = String(app.status || 'PENDING').toUpperCase();
                  const isPending = st === 'PENDING';
                  const isApproved =
                    st === 'APPROVED' || st === 'OWNER_APPROVED';
                  const badgeTone = getAppBadgeTone(st);
                  const isThisAppBusy = busyAppId === appId;
                  const anyAppBusy = Boolean(busyAppId);

                  return (
                    <View key={appId} style={styles.appCard}>
                      <View style={styles.appHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.appName} numberOfLines={1}>
                            {app.applicantName}
                          </Text>
                          {Boolean(app.applied_at) && (
                            <Text style={styles.appDateText}>
                              Submitted {formatDisplayDate(app.applied_at)}
                            </Text>
                          )}
                        </View>
                        <View
                          style={[
                            styles.appStatusBadge,
                            { backgroundColor: badgeTone.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.appStatusText,
                              { color: badgeTone.text },
                            ]}
                          >
                            {st}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.contactRow}>
                        <Text style={styles.phoneText}>
                          📞 {app.contactNumber || app.contact_number}
                        </Text>
                        <CallButton
                          phone={app.contactNumber || app.contact_number}
                        />
                      </View>

                      <Text style={styles.appMessage}>💬 "{app.message}"</Text>

                      {isPending && (
                        <View style={styles.ownerActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.declineBtn,
                              { borderColor: palette.danger },
                              anyAppBusy && !isThisAppBusy && { opacity: 0.5 },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                appId,
                                app.applicantName || 'Applicant',
                                'decline'
                              )
                            }
                            activeOpacity={0.8}
                            disabled={anyAppBusy}
                          >
                            {isThisAppBusy && busyAction === 'decline' ? (
                              <ActivityIndicator
                                size="small"
                                color={palette.danger}
                              />
                            ) : (
                              <Text
                                style={[
                                  styles.declineBtnText,
                                  { color: palette.danger },
                                ]}
                              >
                                Decline
                              </Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.approveBtn,
                              anyAppBusy && !isThisAppBusy && { opacity: 0.5 },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                appId,
                                app.applicantName || 'Applicant',
                                'approve'
                              )
                            }
                            activeOpacity={0.8}
                            disabled={anyAppBusy}
                          >
                            {isThisAppBusy && busyAction === 'approve' ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.approveBtnText}>
                                Approve & Reserve
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {isApproved && (
                        <TouchableOpacity
                          style={[
                            styles.handoverBtn,
                            { backgroundColor: palette.primary },
                            anyAppBusy && !isThisAppBusy && { opacity: 0.5 },
                          ]}
                          onPress={() =>
                            handleOwnerConfirmTransfer(
                              appId,
                              app.applicantName || 'Adopter'
                            )
                          }
                          activeOpacity={0.8}
                          disabled={anyAppBusy}
                        >
                          {isThisAppBusy && busyAction === 'handover' ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.handoverBtnText}>
                              🤝 Confirm Final Handover
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Housing Requirements & Compatibility Card (only when tags exist) */}
          {pet.temperament.length > 0 && (
            <View style={styles.cardSection}>
              <Text style={styles.sectionTitle}>🏡 Home & Space Suitability</Text>
              <View style={styles.tagWrap}>
                {pet.temperament.map((tag: string, idx: number) => (
                  <View
                    key={idx}
                    style={[
                      styles.tagPill,
                      {
                        backgroundColor: palette.primaryMuted,
                        borderColor: semanticTones.infoBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: palette.primary }]}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Description & Story Card */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionTitle}>📖 Pet Story & Temperament</Text>
            <Text style={styles.bodyText}>{pet.description}</Text>
          </View>

          {/* Adopter Requirements Card */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionTitle}>📋 Adopter Requirements</Text>
            <View
              style={[
                styles.clearanceBanner,
                {
                  backgroundColor: semanticTones.successBannerBg,
                  borderLeftColor: semanticTones.successBannerBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.clearanceText,
                  { color: semanticTones.successBannerText },
                ]}
              >
                ✓ {pet.healthClearance}
              </Text>
            </View>
          </View>

          {/* Official Veterinary Records Card */}
          {pet.vaccinations.length > 0 && (
            <View style={styles.cardSection}>
              <Text style={styles.sectionTitle}>
                💉 Official Veterinary Records
              </Text>
              {pet.vaccinations.map((vac: any, index: number) => (
                <View key={index} style={styles.vacCard}>
                  <View style={styles.vacHeader}>
                    <Text style={styles.vacName}>{vac.vaccine}</Text>
                    <Text style={[styles.vacDate, { color: palette.primary }]}>
                      {formatDisplayDate(vac.dateAdministered)}
                    </Text>
                  </View>
                  <Text style={styles.vacVet}>
                    🩺 Administered by: {vac.administeringVet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Dynamic Bottom Status / Apply Bar for Pet Owners */}
      {!isOwnerOfListing && !isOfficer && (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 14 },
          ]}
        >
          {hasBlockingApplication ? (
            <View
              style={[
                styles.statusBottomCard,
                {
                  backgroundColor:
                    existingAppStatus === 'APPROVED' ||
                    existingAppStatus === 'OWNER_APPROVED'
                      ? semanticTones.availableBg
                      : palette.primaryMuted,
                  borderColor:
                    existingAppStatus === 'APPROVED' ||
                    existingAppStatus === 'OWNER_APPROVED'
                      ? semanticTones.successBannerBorder
                      : semanticTones.infoBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBottomText,
                  {
                    color:
                      existingAppStatus === 'APPROVED' ||
                      existingAppStatus === 'OWNER_APPROVED'
                        ? semanticTones.availableText
                        : palette.primary,
                  },
                ]}
              >
                {existingAppStatus === 'APPROVED' ||
                existingAppStatus === 'OWNER_APPROVED'
                  ? '🎉 Application Approved — Check Profile > Adoptions to coordinate handover'
                  : '✓ Application Pending — Owner is reviewing your request'}
              </Text>
            </View>
          ) : isAdopted || isListingHiddenOrRemoved ? (
            <View
              style={[
                styles.statusBottomCard,
                {
                  backgroundColor: semanticTones.adoptedBg,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBottomText,
                  { color: semanticTones.adoptedText },
                ]}
              >
                🏡 This listing is no longer accepting applications
              </Text>
            </View>
          ) : isReserved ? (
            <View
              style={[
                styles.statusBottomCard,
                {
                  backgroundColor: semanticTones.reservedBg,
                  borderColor: semanticTones.warningBannerBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBottomText,
                  { color: semanticTones.reservedText },
                ]}
              >
                ⏳ Reserved by Owner — New applications are currently paused
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.applyBtn,
                {
                  backgroundColor: palette.primary,
                  shadowColor: palette.primary,
                },
              ]}
              onPress={openApplyModal}
              activeOpacity={0.85}
            >
              <Text style={styles.applyBtnText}>
                🐾 Apply to Adopt {pet.name}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Modal 1: Apply to Adopt (`applyAdoption`) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSubmittingApp) setModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isSubmittingApp) setModalVisible(false);
            }}
          />
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeading}>
                  Apply to Adopt {pet.name}
                </Text>
                <Text style={styles.modalSubheading}>
                  Your application goes directly to {pet.ownerDisplayName} for
                  review.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  if (!isSubmittingApp) setModalVisible(false);
                }}
                disabled={isSubmittingApp}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.modalCloseText, { color: palette.secondary }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 380 }}
            >
              <Text style={styles.fieldLabel}>
                Your Contact Number (Required) *
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  contactError ? { borderColor: palette.danger } : null,
                ]}
                value={adopterContact}
                onChangeText={(val) => {
                  setAdopterContact(val);
                  if (contactError) setContactError(null);
                }}
                placeholder="0917 123 4567"
                keyboardType="phone-pad"
                placeholderTextColor="#94A3B8"
                editable={!isSubmittingApp}
              />
              {Boolean(contactError) && (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {contactError}
                </Text>
              )}

              <View style={styles.labelWithCounter}>
                <Text style={styles.fieldLabel}>
                  Reason for Adoption & Home Setup (Required) *
                </Text>
                <Text style={[styles.charCounter, { color: palette.secondary }]}>
                  {adoptionReason.length}/{MAX_REASON_LENGTH}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  { height: 108, textAlignVertical: 'top' },
                  reasonError ? { borderColor: palette.danger } : null,
                ]}
                value={adoptionReason}
                onChangeText={(val) => {
                  setAdoptionReason(val);
                  if (reasonError) setReasonError(null);
                }}
                placeholder="Tell the owner about your experience with pets, housing type, and why you'd love to adopt..."
                placeholderTextColor="#94A3B8"
                maxLength={MAX_REASON_LENGTH}
                multiline
                editable={!isSubmittingApp}
              />
              {Boolean(reasonError) && (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {reasonError}
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
                disabled={isSubmittingApp}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitModalBtn,
                  { backgroundColor: palette.primary },
                  isSubmittingApp && { opacity: 0.7 },
                ]}
                onPress={handleSubmitApplication}
                disabled={isSubmittingApp}
              >
                {isSubmittingApp ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitModalBtnText}>
                    Submit Application
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Update Listing Photo Consent (`updateListingPhotos`) */}
      <Modal
        visible={photoModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isUpdatingPhotos) setPhotoModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isUpdatingPhotos) setPhotoModalVisible(false);
            }}
          />
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeading}>Listing Photo Sharing</Text>
                <Text style={styles.modalSubheading}>
                  Control which photos are visible on this public adoption card.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  if (!isUpdatingPhotos) setPhotoModalVisible(false);
                }}
                disabled={isUpdatingPhotos}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.modalCloseText, { color: palette.secondary }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Publish Pet Photo on Listing
              </Text>
              <Switch
                value={publishPetPhoto}
                onValueChange={setPublishPetPhoto}
                disabled={isUpdatingPhotos}
                trackColor={{ false: palette.border, true: palette.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Publish My Profile Avatar on Listing
              </Text>
              <Switch
                value={publishOwnerPhoto}
                onValueChange={setPublishOwnerPhoto}
                disabled={isUpdatingPhotos}
                trackColor={{ false: palette.border, true: palette.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setPhotoModalVisible(false)}
                disabled={isUpdatingPhotos}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitModalBtn,
                  { backgroundColor: palette.primary },
                  isUpdatingPhotos && { opacity: 0.7 },
                ]}
                onPress={handleUpdateListingPhotos}
                disabled={isUpdatingPhotos}
              >
                {isUpdatingPhotos ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitModalBtnText}>Save Preferences</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { backgroundColor: '#F8FAFC' },
  heroContainer: {
    width: '100%',
    height: 290,
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  petImage: { width: '100%', height: '100%' },
  floatingStatusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  floatingStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  floatingVerifiedBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  floatingVerifiedText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  cardContent: {
    paddingHorizontal: 16,
    marginTop: -20,
    zIndex: 2,
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  petName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 28,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 14,
  },
  ownerAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
  },
  ownerAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarInitial: {
    fontSize: 12,
    fontWeight: '800',
  },
  ownerSubText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 11,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 18,
  },
  tokenBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  tokenLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  tokenLabel: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  tokenValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  tokenValue: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  tokenShareHint: {
    fontSize: 12,
  },
  ownerControlCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  hiddenNoticeBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  hiddenNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  ownerBtn: {
    flex: 1,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerBtnText: { fontSize: 13, fontWeight: '700' },
  emptyAppsBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyAppsText: {
    fontSize: 13,
    color: '#64748B',
  },
  appCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  appName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  appDateText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  appStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  appStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  phoneText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  appMessage: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
    marginVertical: 6,
    lineHeight: 18,
  },
  ownerActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: { fontWeight: '700', fontSize: 13 },
  approveBtn: {
    flex: 1.5,
    backgroundColor: '#16A34A',
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  handoverBtn: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  handoverBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: { fontSize: 12, fontWeight: '600' },
  bodyText: { fontSize: 14, color: '#334155', lineHeight: 22 },
  clearanceBanner: {
    borderLeftWidth: 4,
    padding: 12,
    borderRadius: 10,
  },
  clearanceText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  vacCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  vacHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  vacName: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  vacDate: { fontSize: 11, fontWeight: '700' },
  vacVet: { fontSize: 12, color: '#64748B', marginTop: 2 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  applyBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  statusBottomCard: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBottomText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalSubheading: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  labelWithCounter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  charCounter: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1E293B',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelModalBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalBtnText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  submitModalBtn: {
    flex: 1.5,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
