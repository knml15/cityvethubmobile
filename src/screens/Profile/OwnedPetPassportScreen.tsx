import CallButton from '../../components/CallButton';
import { useAppPalette, useThemedStyles } from '../../theme';
import BreedPicker, { Picker } from '../../components/BreedPicker';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveSync } from '../../utils/useLiveSync';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Alert,
  Share,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Query } from 'react-native-appwrite';
import {
  databases,
  operate,
  uploadMediaFile,
  getMediaFileUrl,
  getPetPassportQrUrl,
  APPWRITE_DATABASE_ID,
  TABLES,
} from '../../api/client';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import {
  MedicalRecordRow,
  OwnershipEventRow,
  PetHealthUploadRow,
  PetProfileRow,
} from '../../store/types/pets';
import { useAdoptionStore, useAuthStore } from '../../store';

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

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseStrictYmd(value: string): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function addMonthsYmd(baseYmd: string, months: number): string {
  const base = parseStrictYmd(baseYmd) || new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
  return formatYmd(next);
}

function formatSafeDate(rawDate?: string, includeTime = false): string {
  if (!rawDate) return 'Unknown date';
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return includeTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

function extractExpiryInfo(
  rawText?: string,
  explicitExpiry?: string
): {
  expiryStr: string | null;
  cleanText: string;
  status: 'expired' | 'soon' | 'valid' | null;
} {
  const source = String(rawText || '');
  const match = source.match(/\s*\[Exp:\s*([^\]]+)\]/i);
  const expiryStr = (explicitExpiry || match?.[1] || '').trim() || null;
  const cleanText = match ? source.replace(match[0], '').trim() : source.trim();

  if (!expiryStr) {
    return { expiryStr: null, cleanText, status: null };
  }

  const parsed = parseStrictYmd(expiryStr) || new Date(expiryStr);
  if (Number.isNaN(parsed.getTime())) {
    return { expiryStr, cleanText, status: 'valid' };
  }

  const today = new Date();
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const expMidnight = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diffDays = Math.ceil(
    (expMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return { expiryStr, cleanText, status: 'expired' };
  if (diffDays <= 30) return { expiryStr, cleanText, status: 'soon' };
  return { expiryStr, cleanText, status: 'valid' };
}

export default function OwnedPetPassportScreen({ route, navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const isDark = user?.theme === 'dark';

  const semanticColors = useMemo(
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
    }),
    [isDark, colors.danger]
  );

  const initialPet = route.params?.pet || {};
  const petProfileId = String(
    initialPet.petProfileId || initialPet.id || initialPet.$id || ''
  );

  const { listOwnPet } = useAdoptionStore();

  const [petDoc, setPetDoc] = useState<PetProfileRow | null>(null);
  const [officialPetId, setOfficialPetId] = useState<string | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecordRow[]>([]);
  const [healthUploads, setHealthUploads] = useState<PetHealthUploadRow[]>([]);
  const [ownershipHistory, setOwnershipHistory] = useState<OwnershipEventRow[]>(
    []
  );
  const [hasActiveListing, setHasActiveListing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const [heroImageError, setHeroImageError] = useState(false);
  const [qrImageError, setQrImageError] = useState(false);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>(
    {}
  );

  const hasLoadedOnceRef = useRef(false);

  // Edit Pet / Public Passport Details Modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpecies, setEditSpecies] = useState<'Dog' | 'Cat'>('Dog');
  const [editBreed, setEditBreed] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editSex, setEditSex] = useState<'Male' | 'Female'>('Male');
  const [editAge, setEditAge] = useState('1');
  const [editVitalStatus, setEditVitalStatus] = useState<
    'Alive' | 'Deceased' | 'Missing'
  >('Alive');
  const [editAncestryParentId, setEditAncestryParentId] = useState('');
  const [editAncestryParent2Id, setEditAncestryParent2Id] = useState('');
  const [possibleParents, setPossibleParents] = useState<PetProfileRow[]>([]);
  const [editBarangay, setEditBarangay] =
    useState<IliganBarangay>('Hinaplanon');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editHomeAddress, setEditHomeAddress] = useState('');
  const [editEmergencyContact, setEditEmergencyContact] = useState('');
  const [editLostFoundMsg, setEditLostFoundMsg] = useState('');
  const [editShareOwnerName, setEditShareOwnerName] = useState(true);
  const [editSharePublicPhoto, setEditSharePublicPhoto] = useState(true);
  const [editShareContact, setEditShareContact] = useState(true);
  const [editSharePublicAddress, setEditSharePublicAddress] = useState(false);
  const [newPhotoAsset, setNewPhotoAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  // Add Personal Health Document Modal (`addPetHealthUpload`)
  const [isHealthModalVisible, setIsHealthModalVisible] = useState(false);
  const [healthTitle, setHealthTitle] = useState('');
  const [healthDate, setHealthDate] = useState(() => formatYmd(new Date()));
  const [healthExpiryDate, setHealthExpiryDate] = useState('');
  const [healthSharePublic, setHealthSharePublic] = useState(false);
  const [healthFileAsset, setHealthFileAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  // List Pet for Adoption Modal (`listOwnPetForAdoption`)
  const [isAdoptModalVisible, setIsAdoptModalVisible] = useState(false);
  const [adoptTitle, setAdoptTitle] = useState('');
  const [adoptStory, setAdoptStory] = useState('');
  const [adoptRequirements, setAdoptRequirements] = useState(
    'Responsible pet owner in Iligan City with secure home environment.'
  );
  const [adoptHousing, setAdoptHousing] = useState<
    'any' | 'apartment' | 'house' | 'yard'
  >('any');
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [showOwnerName, setShowOwnerName] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(false);

  const loadFullPetData = useCallback(
    async (silent = false) => {
      if (!petProfileId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);

      try {
        const profile = (await databases.getDocument(
          APPWRITE_DATABASE_ID,
          TABLES.PET_PROFILES,
          petProfileId
        )) as unknown as PetProfileRow;
        setPetDoc(profile);
        setLoadError(null);

        try {
          const parentsResponse = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.PET_PROFILES,
            [Query.equal('ownerId', profile.ownerId), Query.limit(100)]
          );
          const rawCandidates = (
            parentsResponse.documents as unknown as PetProfileRow[]
          ).filter(
            (candidate) =>
              candidate.$id !== petProfileId &&
              candidate.species === profile.species &&
              candidate.ancestryParentId !== petProfileId &&
              candidate.ancestryParent2Id !== petProfileId
          );
          setPossibleParents(rawCandidates);
        } catch {
          // Keep previously resolved candidates if parent lookup transiently fails
        }

        let resolvedOfficialId: string | null = null;
        try {
          const officialRes = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.PETS,
            [Query.equal('petProfileId', petProfileId), Query.limit(1)]
          );
          if (officialRes.documents.length > 0) {
            resolvedOfficialId = officialRes.documents[0].$id;
          }
        } catch {
          // Not yet in `pets`
        }
        setOfficialPetId(resolvedOfficialId);

        const targetMedIds = [petProfileId];
        if (resolvedOfficialId && resolvedOfficialId !== petProfileId) {
          targetMedIds.push(resolvedOfficialId);
        }
        try {
          const medRes = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.MEDICAL_RECORDS,
            [Query.equal('petId', targetMedIds), Query.orderDesc('$createdAt')]
          );
          setMedicalRecords(medRes.documents as unknown as MedicalRecordRow[]);
        } catch {
          if (!silent) setMedicalRecords([]);
        }

        try {
          const uploadsRes = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.PET_HEALTH_UPLOADS,
            [
              Query.equal('petProfileId', petProfileId),
              Query.orderDesc('$createdAt'),
            ]
          );
          setHealthUploads(
            uploadsRes.documents as unknown as PetHealthUploadRow[]
          );
        } catch {
          if (!silent) setHealthUploads([]);
        }

        try {
          const histRes = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.OWNERSHIP_HISTORY,
            [Query.equal('petId', targetMedIds), Query.orderDesc('$createdAt')]
          );
          setOwnershipHistory(
            histRes.documents as unknown as OwnershipEventRow[]
          );
        } catch {
          if (!silent) setOwnershipHistory([]);
        }

        try {
          const listRes = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            TABLES.ADOPTION_LISTINGS,
            [Query.equal('petProfileId', petProfileId), Query.limit(10)]
          );
          const active = listRes.documents.some(
            (d: any) =>
              d.isActive && String(d.status || '').toLowerCase() !== 'adopted'
          );
          setHasActiveListing(active);
        } catch {
          if (!silent) setHasActiveListing(false);
        }
      } catch (error: any) {
        console.warn('Error loading pet profile details:', error);
        setLoadError(
          error?.message || 'Unable to load latest pet passport details.'
        );
      } finally {
        hasLoadedOnceRef.current = true;
        if (!silent) setLoading(false);
      }
    },
    [petProfileId]
  );

  useEffect(() => {
    loadFullPetData(false);
  }, [loadFullPetData]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedOnceRef.current) {
        loadFullPetData(true);
      }
    }, [loadFullPetData])
  );

  useLiveSync(() => loadFullPetData(true), {
    enabled:
      !isEditModalVisible && !isHealthModalVisible && !isAdoptModalVisible,
  });

  const displayPhotoUrl =
    getMediaFileUrl(petDoc?.photoFileId) || initialPet.photoUrl;

  useEffect(() => {
    setHeroImageError(false);
  }, [displayPhotoUrl]);

  const qrUrl = getPetPassportQrUrl(petProfileId);
  useEffect(() => {
    setQrImageError(false);
  }, [qrUrl]);

  const pickImage = async (
    onSelected: (asset: ImagePicker.ImagePickerAsset) => void
  ) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
    });
    if (!res.canceled && res.assets.length > 0) {
      onSelected(res.assets[0]);
    }
  };

  const verifStatus =
    petDoc?.verificationStatus || initialPet.verificationStatus || 'draft';
  const canEditIdentity =
    verifStatus === 'draft' || verifStatus === 'rejected';

  const statusBadgeMeta = useMemo(() => {
    if (verifStatus === 'verified') {
      return {
        label: '✓ CVO Verified',
        bg: semanticColors.successBg,
        border: semanticColors.successBorder,
        text: semanticColors.successText,
      };
    }
    if (verifStatus === 'pending') {
      return {
        label: '⏳ Pending CVO',
        bg: semanticColors.warningBg,
        border: semanticColors.warningBorder,
        text: semanticColors.warningText,
      };
    }
    if (verifStatus === 'rejected') {
      return {
        label: '✕ Rejected',
        bg: semanticColors.dangerBg,
        border: semanticColors.dangerBorder,
        text: semanticColors.dangerText,
      };
    }
    return {
      label: '📝 Draft',
      bg: colors.surfaceMuted,
      border: colors.border,
      text: colors.secondary,
    };
  }, [verifStatus, semanticColors, colors]);

  const isNonCircularCandidate = (candidate: PetProfileRow) =>
    candidate.$id !== petProfileId &&
    candidate.ancestryParentId !== petProfileId &&
    candidate.ancestryParent2Id !== petProfileId;

  const possibleSires = possibleParents.filter(
    (p) =>
      p.species === editSpecies &&
      p.sex === 'Male' &&
      p.$id !== editAncestryParent2Id &&
      isNonCircularCandidate(p)
  );
  const possibleDams = possibleParents.filter(
    (p) =>
      p.species === editSpecies &&
      p.sex === 'Female' &&
      p.$id !== editAncestryParentId &&
      isNonCircularCandidate(p)
  );

  const parent1DisplayName =
    petDoc?.ancestryParentName ||
    possibleParents.find((p) => p.$id === petDoc?.ancestryParentId)?.petName ||
    '';

  const parent2DisplayName =
    petDoc?.ancestryParent2Name ||
    possibleParents.find((p) => p.$id === petDoc?.ancestryParent2Id)?.petName ||
    '';

  const openEditModal = () => {
    setEditName(petDoc?.petName || initialPet.name || '');
    setEditSpecies(
      (petDoc?.species || initialPet.species) === 'Cat' ? 'Cat' : 'Dog'
    );
    setEditBreed(petDoc?.breed || initialPet.breed || '');
    setEditColor(petDoc?.color || '');
    setEditSex((petDoc?.sex || initialPet.sex) === 'Female' ? 'Female' : 'Male');
    setEditAge(String(petDoc?.ageYears ?? initialPet.ageYears ?? 1));
    setEditVitalStatus(petDoc?.vitalStatus || 'Alive');
    setEditAncestryParentId(petDoc?.ancestryParentId || '');
    setEditAncestryParent2Id(petDoc?.ancestryParent2Id || '');
    setEditBarangay(
      normalizeBarangay(petDoc?.barangay || initialPet.barangay || 'Hinaplanon')
    );
    setEditTitle(petDoc?.profileTitle || '');
    setEditDescription(petDoc?.profileDescription || '');
    setEditHomeAddress(petDoc?.homeAddress || '');
    setEditEmergencyContact(petDoc?.emergencyContact || '');
    setEditLostFoundMsg(petDoc?.lostFoundMessage || '');
    setEditShareOwnerName(petDoc?.shareOwnerName ?? true);
    setEditSharePublicPhoto(petDoc?.sharePublicPhoto ?? true);
    setEditShareContact(petDoc?.shareContact ?? true);
    setEditSharePublicAddress(Boolean(petDoc?.sharePublicAddress));
    setNewPhotoAsset(null);
    setIsEditModalVisible(true);
  };

  const openHealthModal = () => {
    setHealthTitle('');
    setHealthDate(formatYmd(new Date()));
    setHealthExpiryDate('');
    setHealthSharePublic(false);
    setHealthFileAsset(null);
    setIsHealthModalVisible(true);
  };

  const openAdoptModal = () => {
    const petName = petDoc?.petName || initialPet.name || 'My Pet';
    const breed = petDoc?.breed || initialPet.breed || 'Companion';
    setAdoptTitle(`Adopt ${petName} (${breed})`);
    setAdoptStory(
      petDoc?.profileDescription ||
        `${petName} is looking for a loving new home in Iligan City.`
    );
    setAdoptRequirements(
      'Responsible pet owner in Iligan City with secure home environment.'
    );
    setAdoptHousing('any');
    setPublishPetPhoto(true);
    setShowOwnerName(true);
    setPublishOwnerPhoto(false);
    setIsAdoptModalVisible(true);
  };

  const handleRequestPetVerification = async () => {
    setIsProcessing(true);
    setActiveActionId('verify');
    try {
      await operate('requestPetVerification', { petProfileId });
      await loadFullPetData(true);
      Alert.alert(
        'Submitted for Verification',
        'Your pet profile has been submitted to the City Veterinary Office for verification.'
      );
    } catch (error: any) {
      Alert.alert(
        'Verification Request Failed',
        error?.message || 'Could not request pet verification.'
      );
    } finally {
      setIsProcessing(false);
      setActiveActionId(null);
    }
  };

  const handleRepairPassport = async () => {
    setIsProcessing(true);
    setActiveActionId('sync');
    try {
      await operate('ensurePetPassport', { petProfileId });
      Alert.alert(
        'Saved successfully',
        'Your public QR passport has been synced and updated.'
      );
    } catch (error: any) {
      Alert.alert(
        'Passport Sync Notice',
        error?.message || 'Could not sync public QR passport. Please try again.'
      );
    } finally {
      setIsProcessing(false);
      setActiveActionId(null);
    }
  };

  const handleShareQrPassport = async () => {
    try {
      await Share.share({
        title: `${petDoc?.petName || initialPet.name} — CityVetHub Digital Passport`,
        message: `View ${
          petDoc?.petName || initialPet.name
        }'s CityVetHub Digital Pet Passport & QR Link: ${qrUrl}`,
        url: qrUrl,
      });
    } catch {
      // Ignore share cancellation
    }
  };

  const handleSavePetEdits = async () => {
    Keyboard.dismiss();
    const cleanName = editName.trim();
    const cleanBreed = editBreed.trim();
    if (!cleanName || !cleanBreed) {
      Alert.alert('Required Fields', 'Please enter a pet name and breed.');
      return;
    }

    if (
      editAncestryParentId &&
      editAncestryParent2Id &&
      editAncestryParentId === editAncestryParent2Id
    ) {
      Alert.alert(
        'Invalid Ancestry',
        'Sire (Parent 1) and Dam (Parent 2) cannot be the same pet.'
      );
      return;
    }
    if (
      editAncestryParentId === petProfileId ||
      editAncestryParent2Id === petProfileId
    ) {
      Alert.alert(
        'Invalid Ancestry',
        'A pet cannot be listed as its own parent.'
      );
      return;
    }

    const ageInt = parseInt(editAge, 10);
    if (Number.isNaN(ageInt) || ageInt < 0 || ageInt > 40) {
      Alert.alert('Invalid Age', 'Age must be between 0 and 40 years.');
      return;
    }

    setIsProcessing(true);
    setActiveActionId('save');
    try {
      let uploadedPhotoId = petDoc?.photoFileId;
      if (newPhotoAsset) {
        uploadedPhotoId = await uploadMediaFile(newPhotoAsset);
      }

      await operate('updateInventoryPet', {
        petProfileId,
        petName: cleanName,
        species: editSpecies,
        breed: cleanBreed,
        color: editColor.trim(),
        sex: editSex,
        ageYears: ageInt,
        barangay: editBarangay,
        photoFileId: uploadedPhotoId,
        vitalStatus: editVitalStatus,
        ancestryParentId: editAncestryParentId,
        ancestryParent2Id: editAncestryParent2Id,
        profileTitle: editTitle.trim(),
        profileDescription: editDescription.trim(),
        homeAddress: editHomeAddress.trim(),
        emergencyContact: editEmergencyContact.trim(),
        lostFoundMessage: editLostFoundMsg.trim(),
        shareOwnerName: editShareOwnerName,
        sharePublicPhoto: editSharePublicPhoto,
        shareContact: editShareContact,
        sharePublicAddress: editSharePublicAddress,
      });

      setIsEditModalVisible(false);
      setNewPhotoAsset(null);
      await loadFullPetData(true);
      Alert.alert(
        'Saved successfully',
        'Your pet profile and public QR privacy settings have been saved.'
      );
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.message || 'Could not update pet profile.'
      );
    } finally {
      setIsProcessing(false);
      setActiveActionId(null);
    }
  };

  const handleDeletePet = () => {
    if (!canEditIdentity) {
      Alert.alert(
        'Cannot Delete',
        'Only unverified or rejected pet profiles can be deleted.'
      );
      return;
    }
    Alert.alert(
      'Delete Pet Profile?',
      `Are you sure you want to permanently delete ${
        petDoc?.petName || initialPet.name
      } from your inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            setActiveActionId('delete');
            try {
              await operate('deleteInventoryPet', { petProfileId });
              Alert.alert('Deleted', 'Pet profile removed.');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert(
                'Delete Failed',
                error?.message || 'Could not delete pet.'
              );
            } finally {
              setIsProcessing(false);
              setActiveActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleAddHealthUpload = async () => {
    Keyboard.dismiss();
    const cleanTitle = healthTitle.trim();
    const cleanDate = healthDate.trim();
    const cleanExpiry = healthExpiryDate.trim();

    if (!cleanTitle || !healthFileAsset || !cleanDate) {
      Alert.alert(
        'Missing Fields',
        'Please provide a document title, record date, and select an image of the health/vaccination record.'
      );
      return;
    }

    const parsedRecordDate = parseStrictYmd(cleanDate);
    if (!parsedRecordDate) {
      Alert.alert(
        'Invalid Record Date',
        'Please enter Record Date in valid YYYY-MM-DD format (e.g. 2026-11-12).'
      );
      return;
    }

    if (cleanExpiry) {
      const parsedExp = parseStrictYmd(cleanExpiry);
      if (!parsedExp) {
        Alert.alert(
          'Invalid Expiry Date',
          'Please enter a valid Expiry Date in YYYY-MM-DD format or leave it blank.'
        );
        return;
      }
      if (parsedExp.getTime() < parsedRecordDate.getTime()) {
        Alert.alert(
          'Expiry Date Too Early',
          'Expiry date cannot be earlier than the record date.'
        );
        return;
      }
    }

    setIsProcessing(true);
    setActiveActionId('health');
    try {
      const fileId = await uploadMediaFile(healthFileAsset);
      const isoDate = parsedRecordDate.toISOString();
      const finalTitle = cleanExpiry
        ? `${cleanTitle} [Exp: ${cleanExpiry}]`
        : cleanTitle;

      await operate('addPetHealthUpload', {
        petProfileId,
        title: finalTitle.slice(0, 120),
        recordDate: isoDate,
        expiryDate: cleanExpiry || undefined,
        fileId,
        sharePublic: healthSharePublic,
      });

      setIsHealthModalVisible(false);
      setHealthTitle('');
      setHealthExpiryDate('');
      setHealthFileAsset(null);
      await loadFullPetData(true);
      Alert.alert(
        'Saved successfully',
        'Your personal pet health document has been saved.'
      );
    } catch (error: any) {
      Alert.alert(
        'Upload Failed',
        error?.message || 'Could not upload health document.'
      );
    } finally {
      setIsProcessing(false);
      setActiveActionId(null);
    }
  };

  const handleDeleteHealthUpload = (recordId: string, title: string) => {
    const cleanTitle = extractExpiryInfo(title).cleanText || title;
    Alert.alert(
      'Remove Document?',
      `Delete "${cleanTitle}" from this pet's health uploads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            setActiveActionId('deleteDoc-' + recordId);
            try {
              await operate('deletePetHealthUpload', { recordId });
              // Optimistic local removal followed by silent refresh
              setHealthUploads((prev) =>
                prev.filter((item) => item.$id !== recordId)
              );
              loadFullPetData(true);
            } catch (error: any) {
              Alert.alert(
                'Error',
                error?.message || 'Could not delete health document.'
              );
            } finally {
              setIsProcessing(false);
              setActiveActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleCreateAdoptionListing = async () => {
    Keyboard.dismiss();
    if (!adoptTitle.trim() || !adoptStory.trim()) {
      Alert.alert(
        'Required Fields',
        'Please enter a listing headline and your pet story/description.'
      );
      return;
    }

    setIsProcessing(true);
    setActiveActionId('adopt');
    try {
      await listOwnPet({
        petProfileId,
        title: adoptTitle.trim(),
        description: adoptStory.trim(),
        requirements: adoptRequirements.trim(),
        housingRequirement: adoptHousing,
        publishPetPhoto,
        showOwnerName,
        publishOwnerPhoto,
      });

      setIsAdoptModalVisible(false);
      await loadFullPetData(true);
      Alert.alert(
        'Listed successfully',
        `${
          petDoc?.petName || initialPet.name
        } is now live on the Adoption Feed. You can review incoming applications in your Profile > Adoptions tab.`
      );
    } catch (error: any) {
      Alert.alert(
        'Listing Failed',
        error?.message ||
          'Could not create adoption listing. Ensure your pet has a photo if photo sharing is enabled.'
      );
    } finally {
      setIsProcessing(false);
      setActiveActionId(null);
    }
  };

  const isEditInvalid = !editName.trim() || !editBreed.trim();
  const isHealthInvalid =
    !healthTitle.trim() || !healthDate.trim() || !healthFileAsset;
  const isAdoptInvalid = !adoptTitle.trim() || !adoptStory.trim();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => loadFullPetData(false)}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {displayPhotoUrl && !heroImageError ? (
        <Image
          source={{ uri: displayPhotoUrl }}
          style={styles.petImage}
          resizeMode="cover"
          onError={() => setHeroImageError(true)}
        />
      ) : (
        <View
          style={[
            styles.petImageFallback,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <Text style={styles.petImageFallbackEmoji}>
            {(petDoc?.species || initialPet.species) === 'Cat' ? '🐱' : '🐶'}
          </Text>
          <Text style={[styles.petImageFallbackLabel, { color: colors.secondary }]}>
            {(petDoc?.petName || initialPet.name || 'Companion Pet')} Photo
          </Text>
        </View>
      )}

      <View style={styles.contentContainer}>
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
              style={[
                styles.errorBannerText,
                { color: semanticColors.dangerText },
              ]}
            >
              {loadError}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              onPress={() => loadFullPetData(false)}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: 10, minWidth: 0 }}>
            <Text style={styles.petName}>
              {petDoc?.petName || initialPet.name}
            </Text>
            <View style={styles.chipsContainer}>
              {[
                petDoc?.species || initialPet.species || 'Pet',
                petDoc?.breed || initialPet.breed || 'Mixed',
                petDoc?.sex || initialPet.sex || 'Male',
                `${petDoc?.ageYears ?? initialPet.ageYears ?? 1} yr(s)`,
              ].map((chipVal, idx) => (
                <View
                  key={`${chipVal}-${idx}`}
                  style={[styles.chip, { backgroundColor: colors.primaryMuted }]}
                >
                  <Text style={[styles.chipText, { color: colors.primary }]}>
                    {chipVal}
                  </Text>
                </View>
              ))}
            </View>
            {petDoc?.profileTitle ? (
              <Text
                style={[styles.profileHeadline, { color: colors.primary }]}
              >
                "{petDoc.profileTitle}"
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: statusBadgeMeta.bg,
                borderColor: statusBadgeMeta.border,
              },
            ]}
          >
            <Text
              style={[styles.badgeText, { color: statusBadgeMeta.text }]}
            >
              {statusBadgeMeta.label}
            </Text>
          </View>
        </View>

        {verifStatus === 'rejected' && (
          <View
            style={[
              styles.revisionBanner,
              {
                backgroundColor: semanticColors.dangerBg,
                borderColor: semanticColors.dangerBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.revisionBannerTitle,
                { color: semanticColors.dangerText },
              ]}
            >
              Registration Needs Revision
            </Text>
            <Text
              style={[
                styles.revisionBannerText,
                { color: semanticColors.dangerText },
              ]}
            >
              Update your pet details via Edit Profile & QR Privacy, then tap
              Send to CVO to resubmit for verification.
            </Text>
          </View>
        )}

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[
              styles.actionBtnPrimary,
              { backgroundColor: colors.primary, shadowColor: colors.primary },
            ]}
            onPress={openEditModal}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnPrimaryText}>
              ✏️ Edit Profile & QR Privacy
            </Text>
          </TouchableOpacity>

          {(canEditIdentity || !hasActiveListing) && (
            <View style={styles.actionRowSecondary}>
              {canEditIdentity && (
                <TouchableOpacity
                  style={[styles.actionBtnVerify, !hasActiveListing && { flex: 1 }]}
                  onPress={handleRequestPetVerification}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  {activeActionId === 'verify' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.actionBtnVerifyText} numberOfLines={1}>
                      🛡️ Send to CVO
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {!hasActiveListing && (
                <TouchableOpacity
                  style={[
                    styles.actionBtnAdopt,
                    {
                      backgroundColor: colors.primaryMuted,
                      borderColor: colors.primary,
                    },
                    canEditIdentity && { flex: 1 },
                  ]}
                  onPress={openAdoptModal}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  {activeActionId === 'adopt' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text
                      style={[styles.actionBtnAdoptText, { color: colors.primary }]}
                      numberOfLines={1}
                    >
                      🏡 List for Adoption
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {canEditIdentity && (
            <TouchableOpacity
              style={[
                styles.actionBtnDelete,
                {
                  backgroundColor: semanticColors.dangerBg,
                  borderColor: semanticColors.dangerBorder,
                },
              ]}
              onPress={handleDeletePet}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              {activeActionId === 'delete' ? (
                <ActivityIndicator
                  size="small"
                  color={semanticColors.dangerText}
                />
              ) : (
                <Text
                  style={[
                    styles.actionBtnDeleteText,
                    { color: semanticColors.dangerText },
                  ]}
                >
                  🗑️ Delete Pet Profile
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Pet Description</Text>
          <Text style={styles.descriptionText}>
            {petDoc?.profileDescription ||
              petDoc?.profileTitle ||
              'No pet description added yet.'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ancestry & Vital Status</Text>
          <View style={styles.ancestryGrid}>
            <View style={styles.ancestryItem}>
              <Text style={styles.ancestryLabel}>Vital Status</Text>
              <Text style={styles.ancestryValue}>
                {petDoc?.vitalStatus || 'Alive'}
              </Text>
            </View>
            <View style={styles.ancestryItem}>
              <Text style={styles.ancestryLabel}>Sire (Parent 1)</Text>
              <Text style={styles.ancestryValue}>
                {parent1DisplayName || 'Unknown / not listed'}
              </Text>
            </View>
            <View style={styles.ancestryItem}>
              <Text style={styles.ancestryLabel}>Dam (Parent 2)</Text>
              <Text style={styles.ancestryValue}>
                {parent2DisplayName || 'Unknown / not listed'}
              </Text>
            </View>
          </View>
          <Text style={styles.ancestryHint}>
            ℹ️ Tap Edit Profile & QR Privacy above to update ancestry.
          </Text>
        </View>

        {!!petDoc?.emergencyContact && (
          <View
            style={[
              styles.emergencyCard,
              {
                backgroundColor: semanticColors.dangerBg,
                borderColor: semanticColors.dangerBorder,
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={[
                  styles.emergencyLabel,
                  { color: semanticColors.dangerText },
                ]}
              >
                🚨 Emergency Contact
              </Text>
              <Text
                style={[
                  styles.emergencyPhone,
                  { color: semanticColors.dangerText },
                ]}
              >
                {petDoc.emergencyContact}
              </Text>
            </View>
            <CallButton phone={petDoc.emergencyContact} />
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            QR Digital Identification & Traceability
          </Text>

          <View style={styles.qrPlaceholderBox}>
            <View style={styles.qrCodeCanvas}>
              {!qrImageError ? (
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      qrUrl
                    )}`,
                  }}
                  style={styles.qrImage}
                  onError={() => setQrImageError(true)}
                />
              ) : (
                <View style={styles.qrFallbackBox}>
                  <Text style={styles.qrFallbackIcon}>📱</Text>
                  <Text style={[styles.qrFallbackText, { color: colors.secondary }]}>
                    QR image unavailable offline. Share link or read ID below.
                  </Text>
                </View>
              )}
            </View>
            <View
              style={[
                styles.qrTokenChip,
                { backgroundColor: colors.primaryMuted },
              ]}
            >
              <Text
                style={[styles.qrTokenText, { color: colors.primary }]}
                selectable
              >
                QR ID: {petProfileId}
              </Text>
            </View>
            {petDoc?.officialRegistryId ? (
              <View
                style={[
                  styles.registryIdChip,
                  { backgroundColor: semanticColors.successBg },
                ]}
              >
                <Text
                  style={[
                    styles.officialIdText,
                    { color: semanticColors.successText },
                  ]}
                  selectable
                >
                  Official CVO Registry ID: {petDoc.officialRegistryId}
                </Text>
              </View>
            ) : (
              <Text style={styles.qrInstruction}>
                Personal QR Active • Official Registry ID assigned after CVO
                verification
              </Text>
            )}

            <View style={styles.qrActionsRow}>
              <TouchableOpacity
                style={[styles.smallQrBtn, { backgroundColor: colors.primary }]}
                onPress={handleShareQrPassport}
                activeOpacity={0.8}
              >
                <Text style={styles.smallQrBtnText}>📤 Share QR Passport</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.smallQrBtn,
                  styles.smallQrBtnSecondary,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
                onPress={handleRepairPassport}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {activeActionId === 'sync' ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={[styles.smallQrBtnText, { color: colors.text }]}>
                    🔄 Sync Public QR
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Barangay:</Text>
            <Text style={styles.dataValue}>
              Brgy. {petDoc?.barangay || initialPet.barangay}, Iligan City
            </Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Public Consent:</Text>
            <Text style={styles.dataValue}>
              {[
                petDoc?.shareOwnerName ? 'Name' : null,
                petDoc?.sharePublicPhoto ? 'Photo' : null,
                petDoc?.shareContact ? 'Phone' : null,
                petDoc?.sharePublicAddress ? 'Address' : null,
              ]
                .filter(Boolean)
                .join(', ') || 'Private (Minimal)'}
            </Text>
          </View>
          {petDoc?.lostFoundMessage ? (
            <View
              style={[
                styles.lostBanner,
                {
                  backgroundColor: semanticColors.warningBg,
                  borderColor: semanticColors.warningBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.lostBannerTitle,
                  { color: semanticColors.warningText },
                ]}
              >
                ⚠️ Lost & Found Note on Public QR:
              </Text>
              <Text
                style={[
                  styles.lostBannerBody,
                  { color: semanticColors.warningText },
                ]}
              >
                {petDoc.lostFoundMessage}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Official CVO Veterinary & Vaccination Logs ({medicalRecords.length})
          </Text>
          {medicalRecords.length === 0 ? (
            <Text style={styles.emptyText}>
              No clinician-logged vaccinations or treatments yet. A CVO Field
              Officer can scan your QR code to log official vaccinations.
            </Text>
          ) : (
            medicalRecords.map((rec) => {
              const { expiryStr, cleanText, status } = extractExpiryInfo(
                rec.description,
                rec.expiryDate
              );
              const expPill =
                status === 'expired'
                  ? {
                      bg: semanticColors.dangerBg,
                      text: semanticColors.dangerText,
                      label: `Expired: ${expiryStr}`,
                    }
                  : status === 'soon'
                  ? {
                      bg: semanticColors.warningBg,
                      text: semanticColors.warningText,
                      label: `Due Soon: ${expiryStr}`,
                    }
                  : {
                      bg: colors.primaryMuted,
                      text: colors.primary,
                      label: `Expires: ${expiryStr}`,
                    };

              return (
                <View
                  key={rec.$id}
                  style={[styles.recordItem, { borderLeftColor: colors.primary }]}
                >
                  <View style={styles.recordTopRow}>
                    <Text style={styles.recordTitle}>
                      ✓ {rec.recordType}: {rec.medicineType}
                    </Text>
                    <View
                      style={[
                        styles.officialBadgeWrap,
                        { backgroundColor: semanticColors.successBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.officialBadge,
                          { color: semanticColors.successText },
                        ]}
                      >
                        CVO Certified
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recordMeta}>
                    Administered: {formatSafeDate(rec.dateAdministered)}
                  </Text>
                  {cleanText ? (
                    <Text style={styles.recordDesc}>{cleanText}</Text>
                  ) : null}
                  {expiryStr ? (
                    <View
                      style={[
                        styles.expiryChip,
                        { backgroundColor: expPill.bg },
                      ]}
                    >
                      <Text
                        style={[styles.expiryChipText, { color: expPill.text }]}
                      >
                        📅 {expPill.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitleNoBorder}>
            Personal Health Document Uploads ({healthUploads.length})
          </Text>
          <Text
            style={[
              styles.unverifiedNotice,
              { color: semanticColors.warningText },
            ]}
          >
            Label: Owner supplied — not clinician verified
          </Text>

          {healthUploads.length === 0 ? (
            <Text style={styles.emptyText}>
              Upload photos of your pet's physical vaccination booklet or
              private clinic receipts here.
            </Text>
          ) : (
            healthUploads.map((up) => {
              const { expiryStr, cleanText } = extractExpiryInfo(
                up.title,
                up.expiryDate
              );
              const thumbUrl = getMediaFileUrl(up.fileId);
              const thumbBroken = Boolean(failedThumbIds[up.$id]);
              return (
                <View key={up.$id} style={styles.uploadCard}>
                  {thumbUrl && !thumbBroken ? (
                    <Image
                      source={{ uri: thumbUrl }}
                      style={styles.uploadThumb}
                      onError={() =>
                        setFailedThumbIds((prev) => ({
                          ...prev,
                          [up.$id]: true,
                        }))
                      }
                    />
                  ) : (
                    <View
                      style={[
                        styles.uploadThumbFallback,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                    >
                      <Text style={{ fontSize: 20 }}>📄</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recordTitle}>
                      {cleanText || up.title}
                    </Text>
                    <Text style={styles.recordMeta}>
                      Date: {formatSafeDate(up.recordDate)}
                      {expiryStr ? ` • Exp: ${expiryStr}` : ''} •{' '}
                      {up.sharePublic ? '🌐 Public on QR' : '🔒 Private'}
                    </Text>
                    <Text
                      style={[
                        styles.ownerSuppliedTag,
                        { color: semanticColors.warningText },
                      ]}
                    >
                      Owner supplied — not CVO certified
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.deleteDocBtn,
                      {
                        backgroundColor: semanticColors.dangerBg,
                        borderColor: semanticColors.dangerBorder,
                      },
                    ]}
                    onPress={() => handleDeleteHealthUpload(up.$id, up.title)}
                    disabled={isProcessing}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    {activeActionId === 'deleteDoc-' + up.$id ? (
                      <ActivityIndicator
                        size="small"
                        color={semanticColors.dangerText}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.deleteLink,
                          { color: semanticColors.dangerText },
                        ]}
                      >
                        Delete
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={[
              styles.addDocBtnFull,
              {
                backgroundColor: colors.primaryMuted,
                borderColor: colors.border,
              },
            ]}
            onPress={openHealthModal}
            activeOpacity={0.8}
          >
            <Text style={[styles.addDocBtnFullText, { color: colors.primary }]}>
              + Upload Health Document
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Ownership & Traceability Timeline ({ownershipHistory.length})
          </Text>
          {ownershipHistory.length === 0 ? (
            <Text style={styles.emptyText}>
              Original owner registration — no ownership transfers recorded.
            </Text>
          ) : (
            ownershipHistory.map((evt) => (
              <View
                key={evt.$id}
                style={[styles.recordItem, { borderLeftColor: colors.primary }]}
              >
                <Text style={styles.recordTitle}>
                  {evt.transferType} Transfer
                </Text>
                <Text style={styles.recordDesc}>
                  From: {evt.previousOwnerName || evt.previousOwnerId} → To:{' '}
                  {evt.newOwnerName || evt.newOwnerId}
                </Text>
                <Text style={styles.recordMeta}>
                  Date: {formatSafeDate(evt.transferDate, true)}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Modal 1: Edit Pet & Public Passport Privacy */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isProcessing) setIsEditModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(24, insets.bottom + 12) },
            ]}
          >
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>
                  Edit Pet Profile & QR Privacy
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsEditModalVisible(false)}
                disabled={isProcessing}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={styles.fieldLabel}>Pet Name *</Text>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Pet name"
                placeholderTextColor={colors.secondary}
                maxLength={100}
                returnKeyType="done"
              />
              <Text style={styles.fieldLabel}>Species</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editSpecies}
                  onValueChange={(v) => {
                    const nextSpecies = v === 'Cat' ? 'Cat' : 'Dog';
                    setEditSpecies(nextSpecies);
                    if (nextSpecies !== editSpecies) {
                      setEditAncestryParentId('');
                      setEditAncestryParent2Id('');
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Dog" value="Dog" />
                  <Picker.Item label="Cat" value="Cat" />
                </Picker>
              </View>
              <Text style={styles.fieldLabel}>Sex</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editSex}
                  onValueChange={(v) => setEditSex(v as 'Male' | 'Female')}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Male" value="Male" />
                  <Picker.Item label="Female" value="Female" />
                </Picker>
              </View>
              <Text style={styles.fieldLabel}>Breed *</Text>
              <BreedPicker
                species={editSpecies}
                value={editBreed}
                onChange={setEditBreed}
              />
              <Text style={styles.fieldLabel}>Age (Years, 0–40)</Text>
              <TextInput
                style={styles.textInput}
                value={editAge}
                onChangeText={setEditAge}
                keyboardType="numeric"
                maxLength={2}
                placeholder="e.g. 2"
                placeholderTextColor={colors.secondary}
                returnKeyType="done"
              />
              <Text style={styles.fieldLabel}>Barangay</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editBarangay}
                  onValueChange={(v) => setEditBarangay(v as IliganBarangay)}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {ILIGAN_BARANGAYS.map((b) => (
                    <Picker.Item key={b} label={b} value={b} />
                  ))}
                </Picker>
              </View>

              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImage(setNewPhotoAsset)}
                activeOpacity={0.8}
              >
                <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                  {newPhotoAsset
                    ? '✅ New Photo Selected (Tap to Change)'
                    : '📷 Replace Pet Photo'}
                </Text>
              </TouchableOpacity>
              {newPhotoAsset?.uri ? (
                <View style={styles.previewRow}>
                  <Image
                    source={{ uri: newPhotoAsset.uri }}
                    style={styles.selectedPreviewThumb}
                  />
                  <Text style={styles.previewCaption}>
                    New photo ready to upload on Save
                  </Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Coat Color</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editColor}
                  onValueChange={(v) => setEditColor(String(v))}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Select coat color" value="" />
                  {Array.from(
                    new Set([...COAT_COLORS, editColor].filter(Boolean))
                  ).map((colorOption) => (
                    <Picker.Item
                      key={colorOption}
                      label={colorOption}
                      value={colorOption}
                    />
                  ))}
                </Picker>
              </View>
              <Text style={styles.fieldLabel}>
                Vital status (alive / deceased / missing)
              </Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editVitalStatus}
                  onValueChange={(v) => setEditVitalStatus(v)}
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
                  selectedValue={editAncestryParentId}
                  onValueChange={(v) => {
                    const val = String(v);
                    setEditAncestryParentId(val);
                    if (val && val === editAncestryParent2Id) {
                      setEditAncestryParent2Id('');
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Unknown / not listed" value="" />
                  {possibleSires.map((parent) => (
                    <Picker.Item
                      key={parent.$id}
                      label={`${parent.petName} · ${parent.breed}`}
                      value={parent.$id}
                    />
                  ))}
                  {!!editAncestryParentId &&
                    !possibleSires.some(
                      (p) => p.$id === editAncestryParentId
                    ) && (
                      <Picker.Item
                        label={`${
                          parent1DisplayName || 'Historical parent 1'
                        } (retained)`}
                        value={editAncestryParentId}
                      />
                    )}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>
                Dam / Parent 2 (Female — same species)
              </Text>
              <View style={styles.pickerBox}>
                <Picker
                  title="Select Dam / Parent 2 (Female)"
                  selectedValue={editAncestryParent2Id}
                  onValueChange={(v) => {
                    const val = String(v);
                    setEditAncestryParent2Id(val);
                    if (val && val === editAncestryParentId) {
                      setEditAncestryParentId('');
                    }
                  }}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Unknown / not listed" value="" />
                  {possibleDams.map((parent) => (
                    <Picker.Item
                      key={parent.$id}
                      label={`${parent.petName} · ${parent.breed}`}
                      value={parent.$id}
                    />
                  ))}
                  {!!editAncestryParent2Id &&
                    !possibleDams.some(
                      (p) => p.$id === editAncestryParent2Id
                    ) && (
                      <Picker.Item
                        label={`${
                          parent2DisplayName || 'Historical parent 2'
                        } (retained)`}
                        value={editAncestryParent2Id}
                      />
                    )}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Pet Description Headline</Text>
              <TextInput
                style={styles.textInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Short headline"
                placeholderTextColor={colors.secondary}
                maxLength={100}
                returnKeyType="done"
              />

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Additional Notes</Text>
                <Text style={styles.charCounter}>
                  {editDescription.length}/1500
                </Text>
              </View>
              <TextInput
                style={[styles.textInput, { height: 78, textAlignVertical: 'top', paddingTop: 10 }]}
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                maxLength={1500}
                placeholder="Detailed pet notes, personality, quirks..."
                placeholderTextColor={colors.secondary}
              />

              <Text style={styles.fieldLabel}>Emergency Contact Phone</Text>
              <TextInput
                style={styles.textInput}
                value={editEmergencyContact}
                onChangeText={setEditEmergencyContact}
                keyboardType="phone-pad"
                maxLength={60}
                placeholder="09XXXXXXXXX"
                placeholderTextColor={colors.secondary}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Home Address</Text>
              <TextInput
                style={styles.textInput}
                value={editHomeAddress}
                onChangeText={setEditHomeAddress}
                placeholder="Street address"
                placeholderTextColor={colors.secondary}
                maxLength={200}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Lost & Found Message</Text>
              <TextInput
                style={styles.textInput}
                value={editLostFoundMsg}
                onChangeText={setEditLostFoundMsg}
                placeholder="Instructions if someone scans your lost pet's QR"
                placeholderTextColor={colors.secondary}
                maxLength={500}
                returnKeyType="done"
              />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                Public QR Data-Sharing Toggles
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show Owner Name on QR</Text>
                <Switch
                  value={editShareOwnerName}
                  onValueChange={setEditShareOwnerName}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show Pet Photo on QR</Text>
                <Switch
                  value={editSharePublicPhoto}
                  onValueChange={setEditSharePublicPhoto}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show Emergency Phone on QR
                </Text>
                <Switch
                  value={editShareContact}
                  onValueChange={setEditShareContact}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show Home Address on QR (Opt-In)
                </Text>
                <Switch
                  value={editSharePublicAddress}
                  onValueChange={setEditSharePublicAddress}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary, shadowColor: colors.primary },
                    (isProcessing || isEditInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleSavePetEdits}
                  disabled={isProcessing || isEditInvalid}
                  activeOpacity={0.8}
                >
                  {isProcessing && activeActionId === 'save' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Upload Dated Health Document (`addPetHealthUpload`) */}
      <Modal
        visible={isHealthModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isProcessing) setIsHealthModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(24, insets.bottom + 12) },
            ]}
          >
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>Upload Health Document</Text>
                <Text style={styles.modalSub}>
                  Attach a dated vaccination booklet page or vet receipt
                  (owner-supplied).
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsHealthModalVisible(false)}
                disabled={isProcessing}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              <Text style={styles.fieldLabel}>Document Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2026 Anti-Rabies Booster Card"
                placeholderTextColor={colors.secondary}
                value={healthTitle}
                onChangeText={setHealthTitle}
                maxLength={120}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Record Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.secondary}
                value={healthDate}
                onChangeText={setHealthDate}
                maxLength={10}
                returnKeyType="done"
              />
              <View style={styles.quickDateRow}>
                <TouchableOpacity
                  style={[
                    styles.quickDateChip,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setHealthDate(formatYmd(new Date()))}
                >
                  <Text
                    style={[styles.quickDateChipText, { color: colors.text }]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>
                Expiry Date (YYYY-MM-DD, Optional)
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2027-11-10 (leave blank if N/A)"
                placeholderTextColor={colors.secondary}
                value={healthExpiryDate}
                onChangeText={setHealthExpiryDate}
                maxLength={10}
                returnKeyType="done"
              />
              <View style={styles.quickDateRow}>
                {[
                  { label: '+6 Mos', months: 6 },
                  { label: '+1 Year', months: 12 },
                  { label: '+3 Years', months: 36 },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.quickDateChip,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      setHealthExpiryDate(addMonthsYmd(healthDate, opt.months))
                    }
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        { color: colors.primary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {healthExpiryDate.trim().length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      {
                        backgroundColor: semanticColors.dangerBg,
                        borderColor: semanticColors.dangerBorder,
                      },
                    ]}
                    onPress={() => setHealthExpiryDate('')}
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        { color: semanticColors.dangerText },
                      ]}
                    >
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImage(setHealthFileAsset)}
                activeOpacity={0.8}
              >
                <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                  {healthFileAsset
                    ? '✅ Document Image Selected (Tap to Change)'
                    : '📄 Select Document Image (Max 5MB) *'}
                </Text>
              </TouchableOpacity>
              {healthFileAsset?.uri ? (
                <View style={styles.previewRow}>
                  <Image
                    source={{ uri: healthFileAsset.uri }}
                    style={styles.selectedPreviewThumb}
                  />
                  <Text style={styles.previewCaption}>
                    Document image ready to upload
                  </Text>
                </View>
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share this document on public QR passport
                </Text>
                <Switch
                  value={healthSharePublic}
                  onValueChange={setHealthSharePublic}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsHealthModalVisible(false)}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary, shadowColor: colors.primary },
                    (isProcessing || isHealthInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleAddHealthUpload}
                  disabled={isProcessing || isHealthInvalid}
                  activeOpacity={0.8}
                >
                  {isProcessing && activeActionId === 'health' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Upload Document</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 3: List Owned Pet for Adoption (`listOwnPetForAdoption`) */}
      <Modal
        visible={isAdoptModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isProcessing) setIsAdoptModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(24, insets.bottom + 12) },
            ]}
          >
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>
                  List {petDoc?.petName || initialPet.name} for Adoption
                </Text>
                <Text style={styles.modalSub}>
                  Publishes your pet to the CityVetHub Adoption Feed. You review
                  applications and confirm final handover directly.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsAdoptModalVisible(false)}
                disabled={isProcessing}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={styles.fieldLabel}>Listing Headline *</Text>
              <TextInput
                style={styles.textInput}
                value={adoptTitle}
                onChangeText={setAdoptTitle}
                placeholder="e.g. Loving, playful companion ready for adoption"
                placeholderTextColor={colors.secondary}
                maxLength={150}
                returnKeyType="done"
              />

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Pet Story & Temperament *</Text>
                <Text style={styles.charCounter}>{adoptStory.length}/1500</Text>
              </View>
              <TextInput
                style={[styles.textInput, { height: 85, textAlignVertical: 'top', paddingTop: 10 }]}
                value={adoptStory}
                onChangeText={setAdoptStory}
                multiline
                maxLength={1500}
                placeholder="Describe your pet's personality, daily habits, favorite food..."
                placeholderTextColor={colors.secondary}
              />

              <Text style={styles.fieldLabel}>Adopter Requirements</Text>
              <TextInput
                style={styles.textInput}
                value={adoptRequirements}
                onChangeText={setAdoptRequirements}
                placeholder="e.g. Quiet home, patient owner"
                placeholderTextColor={colors.secondary}
                maxLength={1000}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Housing Requirement</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={adoptHousing}
                  onValueChange={(v) => setAdoptHousing(v as any)}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Any Suitable Home" value="any" />
                  <Picker.Item label="Apartment Friendly" value="apartment" />
                  <Picker.Item label="House Required" value="house" />
                  <Picker.Item label="Fenced Yard Required" value="yard" />
                </Picker>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                Listing Privacy & Consent
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Publish Pet Photo</Text>
                <Switch
                  value={publishPetPhoto}
                  onValueChange={setPublishPetPhoto}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show My Name on Listing</Text>
                <Switch
                  value={showOwnerName}
                  onValueChange={setShowOwnerName}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show My Profile Avatar on Listing
                </Text>
                <Switch
                  value={publishOwnerPhoto}
                  onValueChange={setPublishOwnerPhoto}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsAdoptModalVisible(false)}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: colors.primary, shadowColor: colors.primary },
                    (isProcessing || isAdoptInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleCreateAdoptionListing}
                  disabled={isProcessing || isAdoptInvalid}
                  activeOpacity={0.8}
                >
                  {isProcessing && activeActionId === 'adopt' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Publish Listing</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 60 },
  petImage: { width: '100%', height: 260, backgroundColor: '#E2E8F0' },
  petImageFallback: {
    width: '100%',
    height: 260,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  petImageFallbackEmoji: { fontSize: 52 },
  petImageFallbackLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  contentContainer: {
    padding: 16,
    marginTop: -24,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  petName: { fontSize: 26, fontWeight: '800', color: '#1E293B', letterSpacing: -0.5 },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3478F6',
  },
  profileHeadline: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#3478F6',
    marginTop: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  revisionBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  revisionBannerTitle: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  revisionBannerText: { fontSize: 12, lineHeight: 17 },
  actionGrid: { gap: 10, marginBottom: 18 },
  actionRowSecondary: { flexDirection: 'row', gap: 10 },
  actionBtnPrimary: {
    backgroundColor: '#3478F6',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3478F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnPrimaryText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  actionBtnVerify: {
    backgroundColor: '#16A34A',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnVerifyText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  actionBtnAdopt: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3478F6',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnAdoptText: { color: '#3478F6', fontWeight: 'bold', fontSize: 13 },
  actionBtnDelete: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDeleteText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  descriptionText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  ancestryGrid: {
    gap: 8,
    marginBottom: 8,
  },
  ancestryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  ancestryLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', flexShrink: 0 },
  ancestryValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  ancestryHint: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  emergencyCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyLabel: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
  emergencyPhone: { fontSize: 16, fontWeight: '800', color: '#991B1B', marginTop: 2 },
  sectionTitleNoBorder: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  unverifiedNotice: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 10,
  },
  addDocBtnFull: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  addDocBtnFullText: {
    color: '#3478F6',
    fontSize: 13,
    fontWeight: '700',
  },
  qrPlaceholderBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrCodeCanvas: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qrImage: { width: 170, height: 170 },
  qrFallbackBox: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  qrFallbackIcon: { fontSize: 28 },
  qrFallbackText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  qrTokenChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
  },
  qrTokenText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3478F6',
  },
  registryIdChip: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  officialIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  qrInstruction: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  qrActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    width: '100%',
  },
  smallQrBtn: {
    flex: 1,
    backgroundColor: '#3478F6',
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallQrBtnSecondary: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  smallQrBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dataLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', flexShrink: 0 },
  dataValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  lostBanner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  lostBannerTitle: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  lostBannerBody: { fontSize: 12, color: '#78350F', marginTop: 3, lineHeight: 18 },
  emptyText: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  recordItem: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3478F6',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recordTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  recordTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B', flex: 1 },
  officialBadgeWrap: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  officialBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  recordMeta: { fontSize: 11, color: '#64748B', marginTop: 3 },
  recordDesc: { fontSize: 12, color: '#334155', marginTop: 4, lineHeight: 16 },
  expiryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  expiryChipText: { fontSize: 10, fontWeight: '700' },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  uploadThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#E2E8F0' },
  uploadThumbFallback: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerSuppliedTag: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 2,
  },
  deleteDocBtn: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteLink: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSub: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 4 },
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
    marginTop: 10,
    marginBottom: 6,
  },
  charCounter: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
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
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  uploadBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  uploadBtnText: { color: '#3478F6', fontSize: 13, fontWeight: '600' },
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
  quickDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickDateChipText: { fontSize: 11, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  switchLabel: { fontSize: 13, color: '#334155', flex: 1 },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  cancelBtnText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#3478F6',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3478F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  disabledBtn: { opacity: 0.45 },
});