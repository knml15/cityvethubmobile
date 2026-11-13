import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Query } from 'react-native-appwrite';
import CallButton from '../../components/CallButton';
import BreedPicker, { Picker } from '../../components/BreedPicker';
import { useAppPalette, useThemedStyles } from '../../theme';
import { useLiveSync } from '../../utils/useLiveSync';
import { useAuthStore, useAdoptionStore } from '../../store';
import {
  APPWRITE_DATABASE_ID,
  TABLES,
  databases,
  getMediaFileUrl,
  getPetPassportQrUrl,
  operate,
  uploadMediaFile,
} from '../../api/client';
import { authApi } from '../../api/auth';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import {
  IdCategoryRow,
  OwnerVerificationRequestRow,
} from '../../store/types/auth';
import { PetProfileRow } from '../../store/types/pets';

const COAT_COLORS = [
  'Black',
  'White',
  'Brown',
  'Cream',
  'Gray',
  'Orange',
  'Golden',
  'Tan',
  'Ginger',
  'Calico',
  'Tortoiseshell',
  'Tabby',
  'Brindle',
  'Spotted',
  'Mixed',
  'Other / Unknown',
] as const;

export interface RegisteredPet {
  id: string;
  petProfileId: string;
  name: string;
  species: 'Dog' | 'Cat';
  breed: string;
  color?: string;
  sex: 'Male' | 'Female';
  ageYears: number;
  controlNumber: string;
  officialRegistryId?: string;
  verificationStatus: 'draft' | 'pending' | 'verified' | 'rejected';
  status: 'Registered' | 'Vaccinated Only' | 'Pending Approval';
  barangay: string;
  homeAddress?: string;
  emergencyContact?: string;
  lostFoundMessage?: string;
  profileTitle?: string;
  profileDescription?: string;
  shareOwnerName?: boolean;
  sharePublicPhoto?: boolean;
  shareContact?: boolean;
  sharePublicAddress?: boolean;
  vaccinationStatus?: string;
  lastVaccinationDate: string;
  rabiesExpiryDate: string;
  ownerName: string;
  ownerContact: string;
  photoFileId?: string;
  photoUrl?: string;
  vitalStatus?: 'Alive' | 'Deceased' | 'Missing';
  ancestryParentId?: string;
  ancestryParentName?: string;
  ancestryParent2Id?: string;
  ancestryParent2Name?: string;
}

type SemanticPalette = {
  successBg: string;
  successText: string;
  successBorder: string;
  warningBg: string;
  warningText: string;
  warningBorder: string;
  dangerBg: string;
  dangerText: string;
  dangerBorder: string;
  neutralBg: string;
  neutralText: string;
  neutralBorder: string;
  onPrimary: string;
};

type BadgeTone = {
  label: string;
  bg: string;
  text: string;
  border: string;
};

function formatSafeDate(raw?: string): string {
  if (!raw) return 'Date unavailable';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Date unavailable';
  return d.toLocaleDateString();
}

function getAccountVerifMeta(
  status: string,
  semantic: SemanticPalette
): BadgeTone {
  if (status === 'verified') {
    return {
      label: '✓ CVO Verified',
      bg: semantic.successBg,
      text: semantic.successText,
      border: semantic.successBorder,
    };
  }
  if (status === 'pending') {
    return {
      label: 'Pending ID Review',
      bg: semantic.warningBg,
      text: semantic.warningText,
      border: semantic.warningBorder,
    };
  }
  if (status === 'rejected') {
    return {
      label: 'ID Rejected',
      bg: semantic.dangerBg,
      text: semantic.dangerText,
      border: semantic.dangerBorder,
    };
  }
  return {
    label: 'Unverified',
    bg: semantic.neutralBg,
    text: semantic.neutralText,
    border: semantic.neutralBorder,
  };
}

function getPetVerifBadgeMeta(
  pet: RegisteredPet,
  semantic: SemanticPalette
): BadgeTone {
  if (pet.verificationStatus === 'verified') {
    return {
      label: `CVO ID: ${pet.officialRegistryId || 'VERIFIED'}`,
      bg: semantic.successBg,
      text: semantic.successText,
      border: semantic.successBorder,
    };
  }
  if (pet.verificationStatus === 'pending') {
    return {
      label: '⏳ Pending CVO',
      bg: semantic.warningBg,
      text: semantic.warningText,
      border: semantic.warningBorder,
    };
  }
  if (pet.verificationStatus === 'rejected') {
    return {
      label: '✕ Rejected',
      bg: semantic.dangerBg,
      text: semantic.dangerText,
      border: semantic.dangerBorder,
    };
  }
  return {
    label: '📝 Draft',
    bg: semantic.neutralBg,
    text: semantic.neutralText,
    border: semantic.neutralBorder,
  };
}

function getApplicationBadgeMeta(
  rawStatus: string,
  semantic: SemanticPalette
): BadgeTone {
  const st = String(rawStatus || 'PENDING').toUpperCase();
  if (
    st === 'APPROVED' ||
    st === 'OWNER_APPROVED' ||
    st === 'COMPLETED'
  ) {
    return {
      label: st,
      bg: semantic.successBg,
      text: semantic.successText,
      border: semantic.successBorder,
    };
  }
  if (st === 'DECLINED' || st === 'REJECTED') {
    return {
      label: st,
      bg: semantic.dangerBg,
      text: semantic.dangerText,
      border: semantic.dangerBorder,
    };
  }
  return {
    label: st === 'PENDING' ? '⏳ PENDING' : st,
    bg: semantic.warningBg,
    text: semantic.warningText,
    border: semantic.warningBorder,
  };
}

export default function UserProfileScreen() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const { user, refreshSession } = useAuthStore();
  const isDark = user?.theme === 'dark';

  const semanticColors = useMemo<SemanticPalette>(
    () => ({
      successBg: isDark ? '#143326' : '#DCFCE7',
      successText: isDark ? '#6EE7B7' : '#166534',
      successBorder: isDark ? '#1F4D3A' : '#BBF7D0',
      warningBg: isDark ? '#3B2B12' : '#FEF3C7',
      warningText: isDark ? '#FCD34D' : '#92400E',
      warningBorder: isDark ? '#5C431C' : '#FDE68A',
      dangerBg: isDark ? '#3E1C24' : '#FEE2E2',
      dangerText: colors.danger,
      dangerBorder: isDark ? '#662A36' : '#FCA5A5',
      neutralBg: colors.surfaceMuted,
      neutralText: colors.secondary,
      neutralBorder: colors.border,
      onPrimary: isDark ? '#0F172A' : '#FFFFFF',
    }),
    [isDark, colors.danger, colors.surfaceMuted, colors.secondary, colors.border]
  );

  const {
    myApplications,
    incomingApplications,
    fetchMyApplications,
    fetchIncomingApplications,
    reviewApplication,
    confirmTransfer,
  } = useAdoptionStore();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [activeTab, setActiveTab] = useState<
    'pets' | 'applications' | 'verification'
  >('pets');

  useEffect(() => {
    const requestedTab = route?.params?.tab;
    if (
      requestedTab &&
      (requestedTab === 'pets' ||
        requestedTab === 'applications' ||
        requestedTab === 'verification')
    ) {
      setActiveTab(requestedTab);
    }
  }, [route?.params?.tab]);

  const [selectedPetForQR, setSelectedPetForQR] =
    useState<RegisteredPet | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSubmittingPet, setIsSubmittingPet] = useState(false);
  const [myPets, setMyPets] = useState<RegisteredPet[]>([]);

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>(
    {}
  );
  const [qrModalImageError, setQrModalImageError] = useState(false);

  const hasLoadedOnceRef = useRef(false);

  // Account Verification State (Gov ID + 1 Owned Pet)
  const [idCategories, setIdCategories] = useState<IdCategoryRow[]>([]);
  const [latestVerifReq, setLatestVerifReq] =
    useState<OwnerVerificationRequestRow | null>(null);
  const [selectedVerifPetId, setSelectedVerifPetId] = useState<string>('');
  const [selectedIdCategoryId, setSelectedIdCategoryId] = useState<string>('');
  const [govIdAsset, setGovIdAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSubmittingVerif, setIsSubmittingVerif] = useState(false);

  // Add Pet Inventory Modal State (`createInventoryPet`)
  const [isAddPetVisible, setIsAddPetVisible] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState<'Dog' | 'Cat'>('Dog');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetColor, setNewPetColor] = useState('');
  const [newPetSex, setNewPetSex] = useState<'Male' | 'Female'>('Male');
  const [newPetAge, setNewPetAge] = useState('');
  const [newPetVitalStatus, setNewPetVitalStatus] = useState<
    'Alive' | 'Deceased' | 'Missing'
  >('Alive');
  const [newPetParentId, setNewPetParentId] = useState('');
  const [newPetParent2Id, setNewPetParent2Id] = useState('');
  const [newPetBarangay, setNewPetBarangay] = useState<IliganBarangay>(
    normalizeBarangay(user?.barangay)
  );
  const [newPetHomeAddress, setNewPetHomeAddress] = useState(
    user?.address || ''
  );
  const [newPetEmergencyContact, setNewPetEmergencyContact] = useState(
    user?.contactNumber || ''
  );
  const [newPetLostFoundMsg, setNewPetLostFoundMsg] = useState('');
  const [newPetTitle, setNewPetTitle] = useState('');
  const [newPetDescription, setNewPetDescription] = useState('');
  const [shareOwnerName, setShareOwnerName] = useState(true);
  const [sharePublicPhoto, setSharePublicPhoto] = useState(true);
  const [shareContact, setShareContact] = useState(true);
  const [sharePublicAddress, setSharePublicAddress] = useState(false);
  const [petImageAsset, setPetImageAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [user?.profileImageUrl]);

  useEffect(() => {
    setQrModalImageError(false);
  }, [selectedPetForQR?.petProfileId]);

  const pickImageAsset = async (
    onPicked: (asset: ImagePicker.ImagePickerAsset) => void
  ) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });

    if (!result.canceled && result.assets.length > 0) {
      onPicked(result.assets[0]);
    }
  };

  const fetchProfileData = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setIsLoadingData(true);

      try {
        const profilesRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          TABLES.PET_PROFILES,
          [
            Query.equal('ownerId', String(user.id)),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ]
        );

        const mappedPets: RegisteredPet[] = (
          profilesRes.documents as unknown as PetProfileRow[]
        ).map((doc) => {
          const verif = doc.verificationStatus || 'draft';
          return {
            id: doc.$id,
            petProfileId: doc.$id,
            name: doc.petName || 'Companion',
            species: doc.species === 'Cat' ? 'Cat' : 'Dog',
            breed: doc.breed || 'Aspin',
            color: doc.color || '',
            sex: doc.sex === 'Female' ? 'Female' : 'Male',
            ageYears: typeof doc.ageYears === 'number' ? doc.ageYears : 1,
            controlNumber:
              doc.officialRegistryId ||
              `QR-${String(doc.$id).slice(0, 8).toUpperCase()}`,
            officialRegistryId: doc.officialRegistryId,
            verificationStatus: verif,
            status:
              verif === 'verified'
                ? 'Registered'
                : verif === 'pending'
                ? 'Pending Approval'
                : 'Vaccinated Only',
            barangay: doc.barangay || user.barangay || 'Poblacion',
            homeAddress: doc.homeAddress || user.address || '',
            emergencyContact: doc.emergencyContact || user.contactNumber || '',
            lostFoundMessage: doc.lostFoundMessage || '',
            profileTitle: doc.profileTitle || '',
            profileDescription: doc.profileDescription || '',
            shareOwnerName: Boolean(doc.shareOwnerName),
            sharePublicPhoto: Boolean(doc.sharePublicPhoto),
            shareContact: Boolean(doc.shareContact),
            sharePublicAddress: Boolean(doc.sharePublicAddress),
            vaccinationStatus:
              doc.vaccinationStatus || 'No official record yet',
            lastVaccinationDate:
              doc.vaccinationStatus || 'View Passport for Clinical Logs',
            rabiesExpiryDate:
              verif === 'verified' ? 'CVO Verified' : 'Personal Inventory',
            ownerName: user.fullName,
            ownerContact: doc.emergencyContact || user.contactNumber || '',
            photoFileId: doc.photoFileId,
            vitalStatus: doc.vitalStatus || 'Alive',
            ancestryParentId: doc.ancestryParentId || '',
            ancestryParentName: doc.ancestryParentName || '',
            ancestryParent2Id: doc.ancestryParent2Id || '',
            ancestryParent2Name: doc.ancestryParent2Name || '',
            photoUrl: getMediaFileUrl(doc.photoFileId),
          };
        });

        setMyPets(mappedPets);
        setFailedThumbIds({});
        if (mappedPets.length > 0 && !selectedVerifPetId) {
          setSelectedVerifPetId(mappedPets[0].petProfileId);
        }

        const [cats, verifReq] = await Promise.all([
          authApi.getActiveIdCategories().catch(() => []),
          authApi.getMyVerificationRequest(String(user.id)).catch(() => null),
        ]);
        setIdCategories(cats);
        if (cats.length > 0 && !selectedIdCategoryId) {
          setSelectedIdCategoryId(cats[0].$id);
        }
        setLatestVerifReq(verifReq);

        await Promise.all([
          fetchMyApplications(silent),
          fetchIncomingApplications(silent),
        ]);
        setLoadError(null);
      } catch (error: any) {
        console.error('Error fetching profile data:', error);
        if (!silent) {
          setLoadError(
            error?.message || 'Unable to sync your profile data right now.'
          );
        }
      } finally {
        if (!silent) setIsLoadingData(false);
      }
    },
    [
      user,
      selectedVerifPetId,
      selectedIdCategoryId,
      fetchMyApplications,
      fetchIncomingApplications,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        fetchProfileData(false);
      } else {
        fetchProfileData(true);
      }
    }, [fetchProfileData])
  );

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchProfileData(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  useLiveSync(() => fetchProfileData(true), {
    enabled: !isAddPetVisible && !selectedPetForQR,
  });

  const openAddPetModal = () => {
    Keyboard.dismiss();
    setNewPetName('');
    setNewPetSpecies('Dog');
    setNewPetBreed('');
    setNewPetColor('');
    setNewPetSex('Male');
    setNewPetAge('');
    setNewPetVitalStatus('Alive');
    setNewPetParentId('');
    setNewPetParent2Id('');
    setNewPetBarangay(normalizeBarangay(user?.barangay));
    setNewPetHomeAddress(user?.address || '');
    setNewPetEmergencyContact(user?.contactNumber || '');
    setNewPetTitle('');
    setNewPetDescription('');
    setNewPetLostFoundMsg('');
    setShareOwnerName(true);
    setSharePublicPhoto(true);
    setShareContact(true);
    setSharePublicAddress(false);
    setPetImageAsset(null);
    setIsAddPetVisible(true);
  };

  const closeAddPetModal = () => {
    if (isSubmittingPet) return;
    Keyboard.dismiss();
    setIsAddPetVisible(false);
  };

  const handleCreateInventoryPet = async () => {
    Keyboard.dismiss();
    if (!newPetName.trim() || !newPetBreed.trim() || !newPetAge.trim()) {
      Alert.alert(
        'Missing Fields',
        "Please enter your pet's name, breed, and age (0–40 years)."
      );
      return;
    }

    const ageInt = parseInt(newPetAge, 10);
    if (isNaN(ageInt) || ageInt < 0 || ageInt > 40) {
      Alert.alert(
        'Invalid Age',
        'Age must be a whole number between 0 and 40.'
      );
      return;
    }

    if (
      newPetParentId &&
      newPetParent2Id &&
      newPetParentId === newPetParent2Id
    ) {
      Alert.alert(
        'Invalid Ancestry',
        'Sire (Parent 1) and Dam (Parent 2) cannot be the same pet.'
      );
      return;
    }

    setIsSubmittingPet(true);
    try {
      let photoFileId: string | undefined;
      if (petImageAsset) {
        photoFileId = await uploadMediaFile(petImageAsset);
      }

      await operate('createInventoryPet', {
        petName: newPetName.trim(),
        species: newPetSpecies,
        breed: newPetBreed.trim(),
        color: newPetColor.trim(),
        sex: newPetSex,
        ageYears: ageInt,
        barangay: newPetBarangay,
        photoFileId,
        vitalStatus: newPetVitalStatus,
        ancestryParentId: newPetParentId,
        ancestryParent2Id: newPetParent2Id,
        profileTitle: newPetTitle.trim() || `${newPetName.trim()}'s Passport`,
        profileDescription: newPetDescription.trim(),
        homeAddress: newPetHomeAddress.trim(),
        emergencyContact: newPetEmergencyContact.trim(),
        lostFoundMessage: newPetLostFoundMsg.trim(),
        shareOwnerName,
        shareContact,
        sharePublicAddress,
        sharePublicPhoto,
      });

      setIsAddPetVisible(false);
      await fetchProfileData(true);
      Alert.alert(
        'Saved successfully',
        'Your pet profile and QR Passport have been created! Tap your pet card to view the QR code, upload health documents, or request official CVO verification.'
      );
    } catch (error: any) {
      Alert.alert(
        'Failed to Add Pet',
        error?.message || 'Could not save pet profile. Please try again.'
      );
    } finally {
      setIsSubmittingPet(false);
    }
  };

  const handleUploadAvatar = async () => {
    Keyboard.dismiss();
    await pickImageAsset(async (asset) => {
      try {
        setIsUploadingAvatar(true);
        await authApi.uploadAndSaveAvatar(asset);
        await refreshSession();
        Alert.alert('Saved successfully', 'Your profile picture has been saved.');
      } catch (error: any) {
        Alert.alert(
          'Avatar Upload Failed',
          error?.message || 'Could not upload avatar.'
        );
      } finally {
        setIsUploadingAvatar(false);
      }
    });
  };

  const handleSubmitAccountVerification = async () => {
    Keyboard.dismiss();
    if (myPets.length === 0 || !selectedVerifPetId) {
      Alert.alert(
        'Pet Profile Required',
        'You must add at least 1 pet in "My Pets" before requesting CVO Account Verification.'
      );
      return;
    }
    if (!selectedIdCategoryId) {
      Alert.alert(
        'ID Category Required',
        'Please select a valid Government ID type.'
      );
      return;
    }
    if (!govIdAsset) {
      Alert.alert(
        'Government ID Photo Required',
        'Please select a clear photo of your Government ID (Max 5MB).'
      );
      return;
    }

    setIsSubmittingVerif(true);
    try {
      if (latestVerifReq && latestVerifReq.status === 'pending') {
        await authApi.replaceVerificationDocument({
          requestId: latestVerifReq.$id,
          asset: govIdAsset,
        });
        Alert.alert(
          'ID Document Replaced',
          'Your pending verification document has been updated.'
        );
      } else {
        await authApi.submitAccountVerification({
          petProfileId: selectedVerifPetId,
          idCategoryId: selectedIdCategoryId,
          asset: govIdAsset,
        });
        Alert.alert(
          'Verification Submitted',
          'Your Government ID has been securely uploaded for CVO Administrator review.'
        );
      }
      setGovIdAsset(null);
      await refreshSession();
      await fetchProfileData(true);
    } catch (error: any) {
      Alert.alert(
        'Verification Error',
        error?.message || 'Failed to submit verification request.'
      );
    } finally {
      setIsSubmittingVerif(false);
    }
  };

  const handleReviewIncoming = (
    applicationId: string,
    applicantName: string,
    decision: 'approve' | 'decline'
  ) => {
    Alert.alert(
      decision === 'approve' ? 'Approve Adoption?' : 'Decline Application?',
      decision === 'approve'
        ? `Are you sure you want to approve ${applicantName}'s application? This will reserve your listing immediately so you can arrange handover.`
        : `Are you sure you want to decline ${applicantName}'s application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approve' ? 'Yes, Approve' : 'Yes, Decline',
          style: decision === 'decline' ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoadingId(applicationId);
            try {
              await reviewApplication(applicationId, decision);
              Alert.alert(
                'Application Updated',
                decision === 'approve'
                  ? 'Application approved and listing reserved! Once you physically hand over the pet, tap "Confirm Final Handover".'
                  : 'Application declined.'
              );
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Action failed.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleConfirmHandover = (
    applicationId: string,
    applicantName: string
  ) => {
    Alert.alert(
      'Confirm Final Pet Handover?',
      `Confirm that you have handed over this pet to ${applicantName}? Ownership of the pet profile, QR passport, and medical records will permanently transfer to the new owner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          style: 'default',
          onPress: async () => {
            setActionLoadingId(applicationId);
            try {
              await confirmTransfer(applicationId);
              await fetchProfileData(true);
              Alert.alert(
                'Ownership Transferred',
                `Pet ownership has been transferred to ${applicantName}.`
              );
            } catch (err: any) {
              Alert.alert(
                'Transfer Error',
                err?.message || 'Transfer failed.'
              );
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleShareQuickQr = async (pet: RegisteredPet) => {
    const qrUrl = getPetPassportQrUrl(pet.petProfileId);
    try {
      await Share.share({
        title: `${pet.name} — CityVetHub QR Passport`,
        message: `Verify ${pet.name}'s (${pet.species} · ${pet.breed}) CityVetHub Digital Passport:\n${qrUrl}\nQR ID: ${pet.petProfileId}`,
      });
    } catch {
      // Cancelled share sheet
    }
  };

  const verifStatus = user?.accountVerificationStatus || 'unverified';
  const accountBadge = getAccountVerifMeta(verifStatus, semanticColors);
  const isAddPetInvalid =
    !newPetName.trim() || !newPetBreed.trim() || !newPetAge.trim();
  const isVerifInvalid =
    myPets.length === 0 ||
    !selectedVerifPetId ||
    !selectedIdCategoryId ||
    !govIdAsset;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      {/* Citizen Profile Header */}
      <View style={styles.userHeaderCard}>
        <TouchableOpacity
          style={styles.userAvatarWrap}
          onPress={handleUploadAvatar}
          disabled={isUploadingAvatar}
          activeOpacity={0.8}
        >
          {user?.profileImageUrl && !avatarLoadError ? (
            <Image
              source={{ uri: user.profileImageUrl }}
              style={styles.userAvatarImg}
              onError={() => setAvatarLoadError(true)}
            />
          ) : (
            <View
              style={[styles.userAvatar, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.avatarText, { color: semanticColors.onPrimary }]}
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : 'C'}
              </Text>
            </View>
          )}
          {isUploadingAvatar ? (
            <View style={styles.avatarLoadingOverlay}>
              <ActivityIndicator color="#FFFFFF" size="small" />
            </View>
          ) : (
            <View
              style={[styles.cameraBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={{ fontSize: 11 }}>📷</Text>
            </View>
          )}
          {verifStatus === 'verified' && (
            <View style={styles.greenCheckBadge}>
              <Text style={styles.greenCheckText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={2}>
              {user?.fullName || 'Pet Owner'}
            </Text>
            <View
              style={[
                styles.verifPill,
                {
                  backgroundColor: accountBadge.bg,
                  borderColor: accountBadge.border,
                },
              ]}
            >
              <Text style={[styles.verifPillText, { color: accountBadge.text }]}>
                {accountBadge.label}
              </Text>
            </View>
          </View>
          <Text style={styles.userLocation}>
            📍 Brgy. {user?.barangay || 'Poblacion'}, Iligan City
          </Text>
          <Text style={styles.userContact} numberOfLines={1}>
            📞 {user?.contactNumber || 'No phone'} • ✉️ {user?.email}
          </Text>
          <View style={styles.headerMiniActions}>
            <TouchableOpacity
              style={[
                styles.editProfileBtn,
                {
                  backgroundColor: colors.primaryMuted,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
            >
              <Text style={[styles.editProfileLink, { color: colors.primary }]}>
                ✏️ Edit Profile & Privacy
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'pets' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setActiveTab('pets')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'pets' && { color: semanticColors.onPrimary },
            ]}
          >
            My Pets ({myPets.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'applications' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setActiveTab('applications')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'applications' && { color: semanticColors.onPrimary },
            ]}
          >
            Adoptions ({myApplications.length + incomingApplications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'verification' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setActiveTab('verification')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'verification' && { color: semanticColors.onPrimary },
            ]}
          >
            ID Verify
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(120, insets.bottom + 100) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {loadError ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: semanticColors.dangerBg,
                borderColor: semanticColors.dangerBorder,
              },
            ]}
          >
            <Text
              style={[styles.errorBannerText, { color: semanticColors.dangerText }]}
            >
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => fetchProfileData(false)}
              style={[
                styles.retryBtn,
                {
                  borderColor: semanticColors.dangerBorder,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Text
                style={[styles.retryBtnText, { color: semanticColors.dangerText }]}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activeTab === 'pets' && (
          <>
            <TouchableOpacity
              style={[
                styles.addPetBtn,
                {
                  backgroundColor: semanticColors.successBg,
                  borderColor: semanticColors.successBorder,
                },
              ]}
              onPress={openAddPetModal}
            >
              <Text
                style={[
                  styles.addPetBtnText,
                  { color: semanticColors.successText },
                ]}
              >
                + Add Companion Animal to My Pets
              </Text>
            </TouchableOpacity>

            {isLoadingData && myPets.length === 0 ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.emptySubtitle, { marginTop: 12 }]}>
                  Loading your pet inventory & adoption updates...
                </Text>
              </View>
            ) : myPets.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🐾</Text>
                <Text style={styles.emptyTitle}>No Pets in Inventory Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add your dog or cat above to generate an instant QR Passport,
                  upload health records, and request official CVO verification.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.emptyActionBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={openAddPetModal}
                >
                  <Text
                    style={[
                      styles.emptyActionBtnText,
                      { color: semanticColors.onPrimary },
                    ]}
                  >
                    + Register Your First Pet
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              myPets.map((pet) => {
                const petBadge = getPetVerifBadgeMeta(pet, semanticColors);
                const thumbFailed = Boolean(failedThumbIds[pet.id]);
                return (
                  <TouchableOpacity
                    key={pet.id}
                    style={styles.petCard}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('OwnedPetPassport', { pet })
                    }
                  >
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.cardIdentityRow}>
                        {pet.photoUrl && !thumbFailed ? (
                          <Image
                            source={{ uri: pet.photoUrl }}
                            style={styles.petThumb}
                            onError={() =>
                              setFailedThumbIds((prev) => ({
                                ...prev,
                                [pet.id]: true,
                              }))
                            }
                          />
                        ) : (
                          <View style={styles.petThumbPlaceholder}>
                            <Text style={{ fontSize: 26 }}>
                              {pet.species === 'Cat' ? '🐱' : '🐶'}
                            </Text>
                          </View>
                        )}
                        <View style={styles.cardTextCol}>
                          <Text style={styles.petName}>{pet.name}</Text>
                          <Text style={styles.petSubtitle}>
                            {pet.breed} • {pet.species} • {pet.sex} •{' '}
                            {pet.ageYears} yr(s)
                          </Text>
                          <Text
                            style={[
                              styles.petBrgyText,
                              { color: colors.primary },
                            ]}
                          >
                            📍 Brgy. {pet.barangay}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: petBadge.bg,
                            borderColor: petBadge.border,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: petBadge.text }]}
                        >
                          {petBadge.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaCard}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>QR Passport ID:</Text>
                        <Text style={styles.infoValue} selectable>
                          {pet.petProfileId}
                        </Text>
                      </View>
                      <View style={[styles.infoRow, { marginBottom: 0 }]}>
                        <Text style={styles.infoLabel}>
                          Vaccination Status:
                        </Text>
                        <Text style={styles.infoValue}>
                          {pet.vaccinationStatus}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[
                          styles.qrBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => setSelectedPetForQR(pet)}
                      >
                        <Text
                          style={[
                            styles.qrBtnText,
                            { color: semanticColors.onPrimary },
                          ]}
                        >
                          📱 Show QR Passport
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.manageBtn,
                          { borderColor: colors.primary },
                        ]}
                        onPress={() =>
                          navigation.navigate('OwnedPetPassport', { pet })
                        }
                      >
                        <Text
                          style={[
                            styles.manageBtnText,
                            { color: colors.primary },
                          ]}
                        >
                          Manage / CVO Verify
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {activeTab === 'applications' && (
          <>
            <Text style={styles.sectionHeader}>
              Incoming Applications for My Listed Pets (
              {incomingApplications.length})
            </Text>
            {incomingApplications.length === 0 ? (
              <View style={[styles.emptyCard, { marginBottom: 20 }]}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No Incoming Applications</Text>
                <Text style={styles.emptySubtitle}>
                  No incoming applications yet. You can list an owned pet for
                  adoption from the Adoption or Pet Passport screen.
                </Text>
              </View>
            ) : (
              incomingApplications.map((inc) => {
                const st = String(inc.status || 'PENDING').toUpperCase();
                const appBadge = getApplicationBadgeMeta(st, semanticColors);
                const isBusyThis = actionLoadingId === String(inc.id);
                return (
                  <View key={String(inc.id)} style={styles.appCard}>
                    <View style={styles.appStatusRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: appBadge.bg,
                            borderColor: appBadge.border,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: appBadge.text }]}
                        >
                          {appBadge.label}
                        </Text>
                      </View>
                      {inc.applied_at && (
                        <Text style={styles.appDateText}>
                          📅 {formatSafeDate(inc.applied_at)}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.applicantNameTitle}>
                      Applicant: {inc.applicantName}
                    </Text>

                    <View style={styles.metaCard}>
                      <Text style={styles.noticeText}>
                        🐾 <Text style={styles.bold}>Pet:</Text>{' '}
                        {inc.petName || inc.listingTitle || 'Adoption listing'}
                      </Text>
                      <View style={styles.contactRow}>
                        <Text style={[styles.noticeText, styles.contactTextFlex]}>
                          📞 <Text style={styles.bold}>Contact:</Text>{' '}
                          {inc.contactNumber || inc.contact_number || 'Not provided'}
                        </Text>
                        <CallButton
                          phone={inc.contactNumber || inc.contact_number}
                        />
                      </View>
                      <Text style={styles.noticeText}>
                        💬 <Text style={styles.bold}>Reason:</Text>{' '}
                        {inc.message || inc.reason_for_adoption}
                      </Text>
                    </View>

                    {st === 'PENDING' && (
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={[
                            styles.manageBtn,
                            {
                              borderColor: semanticColors.dangerBorder,
                              backgroundColor: semanticColors.dangerBg,
                            },
                            isBusyThis && styles.disabledBtn,
                          ]}
                          disabled={isBusyThis}
                          onPress={() =>
                            handleReviewIncoming(
                              String(inc.id),
                              inc.applicantName || 'Applicant',
                              'decline'
                            )
                          }
                        >
                          <Text
                            style={{
                              color: semanticColors.dangerText,
                              fontWeight: '800',
                              fontSize: 12,
                            }}
                          >
                            Decline
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.qrBtn,
                            { backgroundColor: '#16A34A' },
                            isBusyThis && styles.disabledBtn,
                          ]}
                          disabled={isBusyThis}
                          onPress={() =>
                            handleReviewIncoming(
                              String(inc.id),
                              inc.applicantName || 'Applicant',
                              'approve'
                            )
                          }
                        >
                          {isBusyThis ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={[styles.qrBtnText, { color: '#FFFFFF' }]}>
                              Approve & Reserve
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {(st === 'APPROVED' || st === 'OWNER_APPROVED') && (
                      <TouchableOpacity
                        style={[
                          styles.qrBtn,
                          { backgroundColor: colors.primary, marginTop: 12 },
                          isBusyThis && styles.disabledBtn,
                        ]}
                        disabled={isBusyThis}
                        onPress={() =>
                          handleConfirmHandover(
                            String(inc.id),
                            inc.applicantName || 'Adopter'
                          )
                        }
                      >
                        {isBusyThis ? (
                          <ActivityIndicator
                            color={semanticColors.onPrimary}
                            size="small"
                          />
                        ) : (
                          <Text
                            style={[
                              styles.qrBtnText,
                              { color: semanticColors.onPrimary },
                            ]}
                          >
                            🤝 Confirm Final Handover (Transfer Ownership)
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}

            <Text style={styles.sectionHeader}>
              My Submitted Adoption Applications ({myApplications.length})
            </Text>
            {myApplications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🐕</Text>
                <Text style={styles.emptyTitle}>No Submitted Applications</Text>
                <Text style={styles.emptySubtitle}>
                  Browse the Adoption tab to apply for an available companion
                  animal.
                </Text>
              </View>
            ) : (
              myApplications.map((app) => {
                const appBadge = getApplicationBadgeMeta(
                  app.status,
                  semanticColors
                );
                return (
                  <View key={String(app.id)} style={styles.appCard}>
                    <View style={styles.appStatusRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: appBadge.bg,
                            borderColor: appBadge.border,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.badgeText, { color: appBadge.text }]}
                        >
                          {appBadge.label}
                        </Text>
                      </View>
                      {app.applied_at && (
                        <Text style={styles.appDateText}>
                          📅 {formatSafeDate(app.applied_at)}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.applicantNameTitle}>
                      {app.petName ||
                        app.listingTitle ||
                        `Listing #${String(app.listingId || app.pet).slice(
                          0,
                          8
                        )}`}
                    </Text>
                    <Text style={styles.noticeText}>
                      💬 <Text style={styles.bold}>Message:</Text>{' '}
                      {app.reason_for_adoption || app.message}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}

        {activeTab === 'verification' && (
          <View style={styles.petCard}>
            <Text style={styles.sectionHeader}>
              CVO Pet Owner Account Verification
            </Text>
            <View
              style={[
                styles.verifExplainerBanner,
                {
                  backgroundColor: semanticColors.successBg,
                  borderLeftColor: semanticColors.successText,
                },
              ]}
            >
              <Text
                style={[
                  styles.verifExplainerText,
                  { color: semanticColors.successText },
                ]}
              >
                Why verify your account? Only CVO-Verified Pet Owners (green
                check badge) can submit Incident Reports and publish posts,
                comments, or votes in the Community Hub. Note: A verified pet
                alone does not verify your owner account.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current Account Status:</Text>
              <Text style={styles.infoValue}>{verifStatus.toUpperCase()}</Text>
            </View>

            {latestVerifReq?.reviewNote ? (
              <View
                style={[
                  styles.noticeBox,
                  {
                    backgroundColor: colors.primaryMuted,
                    borderLeftColor: colors.primary,
                  },
                ]}
              >
                <Text style={[styles.noticeTitle, { color: colors.primary }]}>
                  CVO Review Note:
                </Text>
                <Text style={styles.noticeText}>
                  {latestVerifReq.reviewNote}
                </Text>
              </View>
            ) : null}

            {verifStatus !== 'verified' && (
              <>
                <Text style={styles.fieldLabel}>
                  1. Select Linked Owned Pet (At Least 1 Pet Required)
                </Text>
                {myPets.length === 0 ? (
                  <Text
                    style={{
                      color: semanticColors.dangerText,
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    Please add at least 1 pet in the "My Pets" tab first.
                  </Text>
                ) : (
                  <View style={styles.pickerBox}>
                    <Picker
                      title="Select Linked Owned Pet"
                      selectedValue={selectedVerifPetId}
                      onValueChange={(v) => setSelectedVerifPetId(String(v))}
                      style={{ color: colors.text, width: '100%' }}
                      dropdownIconColor={colors.text}
                    >
                      {myPets.map((p) => (
                        <Picker.Item
                          key={p.petProfileId}
                          label={`${p.name} (${p.species})`}
                          value={p.petProfileId}
                        />
                      ))}
                    </Picker>
                  </View>
                )}

                <Text style={styles.fieldLabel}>
                  2. Select Accepted Government ID Type
                </Text>
                <View style={styles.pickerBox}>
                  <Picker
                    title="Select Government ID Type"
                    selectedValue={selectedIdCategoryId}
                    onValueChange={(v) => setSelectedIdCategoryId(String(v))}
                    style={{ color: colors.text, width: '100%' }}
                    dropdownIconColor={colors.text}
                  >
                    {idCategories.length === 0 ? (
                      <Picker.Item
                        label="No active ID categories available"
                        value=""
                      />
                    ) : (
                      idCategories.map((c: any) => (
                        <Picker.Item
                          key={c.$id}
                          label={
                            c.categoryType
                              ? `${c.name} (${c.categoryType})`
                              : c.name
                          }
                          value={c.$id}
                        />
                      ))
                    )}
                  </Picker>
                </View>

                <Text style={styles.fieldLabel}>
                  3. Private Government ID Photo (JPG/PNG/WEBP, max 5MB) *
                </Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickImageAsset(setGovIdAsset)}
                >
                  <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                    {govIdAsset
                      ? '✅ Government ID Photo Selected (Tap to Change)'
                      : '🪪 Select Private Government ID Photo'}
                  </Text>
                </TouchableOpacity>
                {govIdAsset?.uri ? (
                  <View style={styles.previewRow}>
                    <Image
                      source={{ uri: govIdAsset.uri }}
                      style={styles.selectedPreviewThumb}
                    />
                    <Text style={styles.previewCaption}>
                      Government ID preview ready for submission
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (isSubmittingVerif || isVerifInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleSubmitAccountVerification}
                  disabled={isSubmittingVerif || isVerifInvalid}
                >
                  {isSubmittingVerif ? (
                    <ActivityIndicator color={semanticColors.onPrimary} />
                  ) : (
                    <Text
                      style={[
                        styles.submitBtnText,
                        { color: semanticColors.onPrimary },
                      ]}
                    >
                      {latestVerifReq?.status === 'pending'
                        ? 'Replace Pending ID Document'
                        : 'Submit Account Verification'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal 1: Add Pet to Personal Inventory (`createInventoryPet`) */}
      <Modal
        visible={isAddPetVisible}
        animationType="slide"
        transparent
        onRequestClose={closeAddPetModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(20, insets.bottom + 8) },
            ]}
          >
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add Pet to Inventory</Text>
                <Text style={styles.modalSubtitle}>
                  Creates your pet profile and scannable QR Passport immediately.
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeAddPetModal}
                disabled={isSubmittingPet}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={styles.fieldLabel}>Species</Text>
              <View style={styles.radioRow}>
                {(['Dog', 'Cat'] as const).map((sp) => (
                  <TouchableOpacity
                    key={sp}
                    style={[
                      styles.radioBtn,
                      newPetSpecies === sp && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primaryMuted,
                      },
                    ]}
                    onPress={() => {
                      setNewPetSpecies(sp);
                      setNewPetBreed('');
                      setNewPetParentId('');
                      setNewPetParent2Id('');
                    }}
                  >
                    <Text
                      style={[
                        styles.radioBtnText,
                        newPetSpecies === sp && {
                          color: colors.primary,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {sp === 'Dog' ? '🐶 Dog' : '🐱 Cat'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Sex</Text>
              <View style={styles.radioRow}>
                {(['Male', 'Female'] as const).map((sx) => (
                  <TouchableOpacity
                    key={sx}
                    style={[
                      styles.radioBtn,
                      newPetSex === sx && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primaryMuted,
                      },
                    ]}
                    onPress={() => setNewPetSex(sx)}
                  >
                    <Text
                      style={[
                        styles.radioBtnText,
                        newPetSex === sx && {
                          color: colors.primary,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {sx === 'Male' ? '♂ Male' : '♀ Female'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Pet Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Bantay, Mingming"
                placeholderTextColor={colors.secondary}
                maxLength={100}
                value={newPetName}
                onChangeText={setNewPetName}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Breed *</Text>
              <BreedPicker
                species={newPetSpecies}
                value={newPetBreed}
                onChange={setNewPetBreed}
              />

              <Text style={styles.fieldLabel}>Coat Color</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={newPetColor}
                  onValueChange={(v) => setNewPetColor(String(v))}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Select coat color" value="" />
                  {COAT_COLORS.map((colorOption) => (
                    <Picker.Item
                      key={colorOption}
                      label={colorOption}
                      value={colorOption}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Age in Years (0–40) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2"
                placeholderTextColor={colors.secondary}
                keyboardType="numeric"
                maxLength={2}
                value={newPetAge}
                onChangeText={(txt) =>
                  setNewPetAge(txt.replace(/[^0-9]/g, ''))
                }
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Vital status</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={newPetVitalStatus}
                  onValueChange={(v) => setNewPetVitalStatus(v)}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Alive" value="Alive" />
                  <Picker.Item label="Deceased" value="Deceased" />
                  <Picker.Item label="Missing" value="Missing" />
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>
                Sire / Parent 1 (Male — same species)
              </Text>
              <View style={styles.pickerBox}>
                <Picker
                  title="Select Sire / Parent 1 (Male)"
                  selectedValue={newPetParentId}
                  onValueChange={(v) => {
                    const val = String(v);
                    setNewPetParentId(val);
                    if (val && val === newPetParent2Id) {
                      setNewPetParent2Id('');
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Unknown / not in inventory" value="" />
                  {myPets
                    .filter(
                      (parent) =>
                        parent.species === newPetSpecies &&
                        parent.sex === 'Male' &&
                        parent.petProfileId !== newPetParent2Id
                    )
                    .map((parent) => (
                      <Picker.Item
                        key={parent.petProfileId}
                        label={`${parent.name} · ${parent.breed}`}
                        value={parent.petProfileId}
                      />
                    ))}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>
                Dam / Parent 2 (Female — same species)
              </Text>
              <View style={styles.pickerBox}>
                <Picker
                  title="Select Dam / Parent 2 (Female)"
                  selectedValue={newPetParent2Id}
                  onValueChange={(v) => {
                    const val = String(v);
                    setNewPetParent2Id(val);
                    if (val && val === newPetParentId) {
                      setNewPetParentId('');
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Unknown / not in inventory" value="" />
                  {myPets
                    .filter(
                      (parent) =>
                        parent.species === newPetSpecies &&
                        parent.sex === 'Female' &&
                        parent.petProfileId !== newPetParentId
                    )
                    .map((parent) => (
                      <Picker.Item
                        key={parent.petProfileId}
                        label={`${parent.name} · ${parent.breed}`}
                        value={parent.petProfileId}
                      />
                    ))}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Barangay (Iligan City)</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={newPetBarangay}
                  onValueChange={(v) => setNewPetBarangay(v as IliganBarangay)}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {ILIGAN_BARANGAYS.map((b) => (
                    <Picker.Item key={b} label={b} value={b} />
                  ))}
                </Picker>
              </View>

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Passport Headline / Title</Text>
                <Text style={styles.charCounter}>{newPetTitle.length}/100</Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="Friendly Aspin in Hinaplanon"
                placeholderTextColor={colors.secondary}
                maxLength={100}
                value={newPetTitle}
                onChangeText={setNewPetTitle}
                returnKeyType="done"
              />

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>
                  Pet Story / Bio (Optional)
                </Text>
                <Text style={styles.charCounter}>
                  {newPetDescription.length}/1500
                </Text>
              </View>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Personality, distinguishing marks, or care notes..."
                placeholderTextColor={colors.secondary}
                multiline
                maxLength={1500}
                value={newPetDescription}
                onChangeText={setNewPetDescription}
              />

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>
                  Lost & Found Instructions (Shown on Public QR)
                </Text>
                <Text style={styles.charCounter}>
                  {newPetLostFoundMsg.length}/500
                </Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="If found wandering, please call my owner immediately."
                placeholderTextColor={colors.secondary}
                maxLength={500}
                value={newPetLostFoundMsg}
                onChangeText={setNewPetLostFoundMsg}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Pet Photo</Text>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImageAsset(setPetImageAsset)}
              >
                <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                  {petImageAsset
                    ? '✅ Photo Selected (Tap to Change)'
                    : '📷 Select Pet Photo'}
                </Text>
              </TouchableOpacity>
              {petImageAsset?.uri ? (
                <View style={styles.previewRow}>
                  <Image
                    source={{ uri: petImageAsset.uri }}
                    style={styles.selectedPreviewThumb}
                  />
                  <Text style={styles.previewCaption}>
                    Pet photo ready to upload
                  </Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>
                Public QR Passport Privacy Consent
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Share Owner Name on QR</Text>
                <Switch
                  value={shareOwnerName}
                  onValueChange={setShareOwnerName}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Share Pet Photo on QR</Text>
                <Switch
                  value={sharePublicPhoto}
                  onValueChange={setSharePublicPhoto}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share Emergency Contact on QR
                </Text>
                <Switch
                  value={shareContact}
                  onValueChange={setShareContact}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share Home Address on QR (Opt-In)
                </Text>
                <Switch
                  value={sharePublicAddress}
                  onValueChange={setSharePublicAddress}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    isSubmittingPet && styles.disabledBtn,
                  ]}
                  onPress={closeAddPetModal}
                  disabled={isSubmittingPet}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary },
                    (isSubmittingPet || isAddPetInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleCreateInventoryPet}
                  disabled={isSubmittingPet || isAddPetInvalid}
                >
                  {isSubmittingPet ? (
                    <ActivityIndicator color={semanticColors.onPrimary} />
                  ) : (
                    <Text
                      style={[
                        styles.submitBtnText,
                        { color: semanticColors.onPrimary },
                      ]}
                    >
                      Save Pet & QR
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Scannable Collar QR Modal */}
      <Modal
        visible={!!selectedPetForQR}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPetForQR(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.qrCardModal}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.qrTitle}>CityVetHub Digital Pet Passport</Text>
                <Text
                  style={[
                    styles.qrSubtitle,
                    {
                      color:
                        selectedPetForQR?.verificationStatus === 'verified'
                          ? semanticColors.successText
                          : semanticColors.warningText,
                    },
                  ]}
                >
                  {selectedPetForQR?.verificationStatus === 'verified'
                    ? `✓ CVO Verified (${selectedPetForQR.officialRegistryId})`
                    : selectedPetForQR?.verificationStatus === 'pending'
                    ? '⏳ Pending CVO Verification • Personal QR'
                    : 'Personal Inventory QR Passport'}
                </Text>
              </View>
            </View>

            {selectedPetForQR && (
              <>
                <View
                  style={[
                    styles.qrWhiteCanvas,
                    {
                      backgroundColor: qrModalImageError
                        ? colors.surfaceMuted
                        : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {!qrModalImageError ? (
                    <Image
                      source={{
                        uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                          getPetPassportQrUrl(selectedPetForQR.petProfileId)
                        )}`,
                      }}
                      style={{ width: 184, height: 184 }}
                      onError={() => setQrModalImageError(true)}
                    />
                  ) : (
                    <View style={styles.qrOfflineBox}>
                      <Text style={{ fontSize: 28 }}>📱</Text>
                      <Text
                        style={[styles.qrOfflineText, { color: colors.secondary }]}
                      >
                        QR preview unavailable offline. Share link or read ID
                        below.
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.qrPetName}>{selectedPetForQR.name}</Text>
                <Text style={styles.qrPetBreed}>
                  {selectedPetForQR.breed} ({selectedPetForQR.species})
                </Text>

                <View style={styles.qrDetailsBox}>
                  <Text style={styles.qrDetailText} selectable>
                    <Text style={styles.bold}>Passport URL: </Text>
                    {getPetPassportQrUrl(selectedPetForQR.petProfileId)}
                  </Text>
                  <Text style={styles.qrDetailText}>
                    <Text style={styles.bold}>Barangay: </Text>
                    {selectedPetForQR.barangay}
                  </Text>
                </View>

                <View style={styles.qrModalActions}>
                  <TouchableOpacity
                    style={[
                      styles.shareQrBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => handleShareQuickQr(selectedPetForQR)}
                  >
                    <Text
                      style={[
                        styles.shareQrText,
                        { color: semanticColors.onPrimary },
                      ]}
                    >
                      📤 Share Link
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.closeQrBtn,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => setSelectedPetForQR(null)}
                  >
                    <Text
                      style={[styles.closeQrText, { color: colors.text }]}
                    >
                      Close
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  userHeaderCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  userAvatarWrap: { position: 'relative', marginRight: 14 },
  userAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#3478F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarImg: { width: 68, height: 68, borderRadius: 34 },
  avatarText: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#3478F6',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  greenCheckBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#16A34A',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  greenCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  userInfo: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  userName: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  verifPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  verifPillText: { fontSize: 10, fontWeight: '800' },
  userLocation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  userContact: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  headerMiniActions: {
    flexDirection: 'row',
    marginTop: 8,
    alignItems: 'center',
  },
  editProfileBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
  },
  editProfileLink: { fontSize: 12, color: '#3478F6', fontWeight: '800' },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  scrollContent: { padding: 16, paddingBottom: 120 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  addPetBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderStyle: 'dashed',
  },
  addPetBtnText: { color: '#166534', fontSize: 13, fontWeight: '800' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
  },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  emptyActionBtn: {
    marginTop: 14,
    backgroundColor: '#3478F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardIdentityRow: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  cardTextCol: { flex: 1, minWidth: 0 },
  petThumb: { width: 64, height: 64, borderRadius: 12 },
  petThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petName: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  petSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  petBrgyText: {
    fontSize: 12,
    color: '#3478F6',
    marginTop: 3,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  metaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 4,
  },
  contactTextFlex: { flex: 1, minWidth: 0 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  qrBtn: {
    flex: 1,
    backgroundColor: '#3478F6',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  qrBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  manageBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3478F6',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  manageBtnText: { color: '#3478F6', fontSize: 12, fontWeight: '800' },
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  appStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  applicantNameTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  noticeBox: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#3478F6',
    padding: 10,
    borderRadius: 6,
    marginVertical: 8,
  },
  noticeTitle: { fontSize: 12, fontWeight: '800', color: '#3478F6' },
  noticeText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  verifExplainerBanner: {
    backgroundColor: '#DCFCE7',
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
  },
  verifExplainerText: { fontSize: 12, color: '#166534', lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { fontSize: 15, color: '#64748B', fontWeight: '800' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCounter: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: '#1E293B',
  },
  textAreaInput: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 4,
  },
  radioRow: { flexDirection: 'row', gap: 10 },
  radioBtn: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  radioBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchLabel: { fontSize: 13, color: '#334155', flex: 1, fontWeight: '500' },
  uploadBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 8,
  },
  uploadBtnText: { color: '#3478F6', fontSize: 13, fontWeight: '700' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  selectedPreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  previewCaption: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  cancelBtnText: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#3478F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabledBtn: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrCardModal: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  qrSubtitle: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  qrWhiteCanvas: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
  },
  qrOfflineBox: {
    width: 184,
    height: 184,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  qrOfflineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
  },
  qrPetName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  qrPetBreed: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  qrDetailsBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrDetailText: { fontSize: 11, color: '#334155', marginBottom: 4 },
  bold: { fontWeight: '800' },
  qrModalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  shareQrBtn: {
    flex: 1.3,
    backgroundColor: '#3478F6',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareQrText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  closeQrBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeQrText: { fontWeight: '800', fontSize: 14 },
});
