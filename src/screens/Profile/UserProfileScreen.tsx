import CallButton from '../../components/CallButton';
import BreedPicker from '../../components/BreedPicker';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Query } from 'react-native-appwrite';
import { useAuthStore, useAdoptionStore } from '../../store';
import {
  databases,
  operate,
  uploadMediaFile,
  getMediaFileUrl,
  getPetPassportQrUrl,
  APPWRITE_DATABASE_ID,
  TABLES,
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

export default function UserProfileScreen() {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const { user, refreshSession } = useAuthStore();
  const {
    myApplications,
    incomingApplications,
    fetchMyApplications,
    fetchIncomingApplications,
    reviewApplication,
    confirmTransfer,
  } = useAdoptionStore();
  const navigation = useNavigation<any>();

  const [activeTab, setActiveTab] = useState<
    'pets' | 'applications' | 'verification'
  >('pets');
  const [selectedPetForQR, setSelectedPetForQR] =
    useState<RegisteredPet | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmittingPet, setIsSubmittingPet] = useState(false);
  const [myPets, setMyPets] = useState<RegisteredPet[]>([]);

  // Account Verification State (Gov ID + 1 Owned Pet)
  const [idCategories, setIdCategories] = useState<IdCategoryRow[]>([]);
  const [latestVerifReq, setLatestVerifReq] =
    useState<OwnerVerificationRequestRow | null>(null);
  const [selectedVerifPetId, setSelectedVerifPetId] = useState<string>('');
  const [selectedIdCategoryId, setSelectedIdCategoryId] = useState<string>('');
  const [govIdAsset, setGovIdAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSubmittingVerif, setIsSubmittingVerif] = useState(false);

  // Edit Profile / Settings Modal State
  const [isEditProfileVisible, setIsEditProfileVisible] = useState(false);
  const [editFullName, setEditFullName] = useState(user?.fullName || '');
  const [editPhone, setEditPhone] = useState(user?.contactNumber || '');
  const [editAddress, setEditAddress] = useState(user?.address || '');
  const [editBarangay, setEditBarangay] = useState<IliganBarangay>(
    normalizeBarangay(user?.barangay)
  );
  const [shareAvatarOnListings, setShareAvatarOnListings] = useState<boolean>(
    Boolean(user?.shareAvatarOnListings)
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  const fetchProfileData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingData(true);

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
          vaccinationStatus: doc.vaccinationStatus || 'No official record yet',
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

      await Promise.all([fetchMyApplications(), fetchIncomingApplications()]);
    } catch (error) {
      console.error('Error fetching profile data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [
    user,
    selectedVerifPetId,
    selectedIdCategoryId,
    fetchMyApplications,
    fetchIncomingApplications,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [fetchProfileData])
  );

  const handleCreateInventoryPet = async () => {
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

    setIsSubmittingPet(true);
    try {
      let photoFileId: string | undefined;
      if (petImageAsset) {
        photoFileId = await uploadMediaFile(petImageAsset);
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
        setIsSubmittingPet(false);
        return;
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
      setNewPetName('');
      setNewPetBreed('');
      setNewPetColor('');
      setNewPetAge('');
      setNewPetVitalStatus('Alive');
      setNewPetParentId('');
      setNewPetParent2Id('');
      setNewPetTitle('');
      setNewPetDescription('');
      setNewPetLostFoundMsg('');
      setPetImageAsset(null);

      await fetchProfileData();
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

  const handleSaveProfileChanges = async () => {
    if (!editFullName.trim()) {
      Alert.alert('Required', 'Full Name cannot be empty.');
      return;
    }
    setIsSavingProfile(true);
    try {
      await authApi.saveProfile({
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        barangay: editBarangay,
      });
      await authApi.setProfilePhotoSharing(shareAvatarOnListings);
      await refreshSession();
      setIsEditProfileVisible(false);
      Alert.alert('Saved successfully', 'Your profile details have been updated.');
    } catch (error: any) {
      Alert.alert('Update Failed', error?.message || 'Could not save profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUploadAvatar = async () => {
    await pickImageAsset(async (asset) => {
      try {
        setIsLoadingData(true);
        await authApi.uploadAndSaveAvatar(asset);
        await refreshSession();
        Alert.alert('Saved successfully', 'Your profile picture has been saved.');
      } catch (error: any) {
        Alert.alert(
          'Avatar Upload Failed',
          error?.message || 'Could not upload avatar.'
        );
      } finally {
        setIsLoadingData(false);
      }
    });
  };

  const handleSubmitAccountVerification = async () => {
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
      await fetchProfileData();
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
            try {
              await confirmTransfer(applicationId);
              await fetchProfileData();
              Alert.alert(
                'Ownership Transferred',
                `Pet ownership has been transferred to ${applicantName}.`
              );
            } catch (err: any) {
              Alert.alert(
                'Transfer Error',
                err?.message || 'Transfer failed.'
              );
            }
          },
        },
      ]
    );
  };

  const verifStatus = user?.accountVerificationStatus || 'unverified';

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
        >
          {user?.profileImageUrl ? (
            <Image
              source={{ uri: user.profileImageUrl }}
              style={styles.userAvatarImg}
            />
          ) : (
            <View style={styles.userAvatar}>
              <Text style={styles.avatarText}>
                {user?.firstName ? user.firstName[0] : 'C'}
              </Text>
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
            <Text style={styles.userName}>{user?.fullName || 'Pet Owner'}</Text>
            <View
              style={[
                styles.verifPill,
                verifStatus === 'verified'
                  ? styles.verifPillGreen
                  : verifStatus === 'pending'
                  ? styles.verifPillAmber
                  : styles.verifPillGray,
              ]}
            >
              <Text
                style={[
                  styles.verifPillText,
                  verifStatus === 'verified'
                    ? { color: '#166534' }
                    : verifStatus === 'pending'
                    ? { color: '#B45309' }
                    : { color: '#475569' },
                ]}
              >
                {verifStatus === 'verified'
                  ? '✓ CVO Verified'
                  : verifStatus === 'pending'
                  ? 'Pending ID Review'
                  : verifStatus === 'rejected'
                  ? 'ID Rejected'
                  : 'Unverified'}
              </Text>
            </View>
          </View>
          <Text style={styles.userLocation}>
            Brgy. {user?.barangay || 'Poblacion'}, Iligan City
          </Text>
          <Text style={styles.userContact}>
            {user?.contactNumber || 'No phone'} • {user?.email}
          </Text>
          <View style={styles.headerMiniActions}>
            <TouchableOpacity
              onPress={() => {
                setEditFullName(user?.fullName || '');
                setEditPhone(user?.contactNumber || '');
                setEditAddress(user?.address || '');
                setEditBarangay(normalizeBarangay(user?.barangay));
                setShareAvatarOnListings(Boolean(user?.shareAvatarOnListings));
                setIsEditProfileVisible(true);
              }}
            >
              <Text style={styles.editProfileLink}>Edit Profile & Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Segmented Control */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'pets' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('pets')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'pets' && styles.segmentTextActive,
            ]}
          >
            My Pets ({myPets.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'applications' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('applications')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'applications' && styles.segmentTextActive,
            ]}
          >
            Adoptions ({myApplications.length + incomingApplications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'verification' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('verification')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'verification' && styles.segmentTextActive,
            ]}
          >
            ID Verify
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingData}
            onRefresh={fetchProfileData}
          />
        }
      >
        {activeTab === 'pets' && (
          <>
            <TouchableOpacity
              style={styles.addPetBtn}
              onPress={() => setIsAddPetVisible(true)}
            >
              <Text style={styles.addPetBtnText}>
                + Add Companion Animal to My Pets
              </Text>
            </TouchableOpacity>

            {myPets.length === 0 && !isLoadingData ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No Pets in Inventory Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add your pet above to generate an instant QR Passport, upload
                  health records, and request CVO verification.
                </Text>
              </View>
            ) : (
              myPets.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  style={styles.petCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate('OwnedPetPassport', { pet })
                  }
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                      {pet.photoUrl ? (
                        <Image
                          source={{ uri: pet.photoUrl }}
                          style={styles.petThumb}
                        />
                      ) : (
                        <View style={styles.petThumbPlaceholder}>
                          <Text style={{ fontSize: 22 }}>
                            {pet.species === 'Cat' ? '🐱' : '🐶'}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.petName}>{pet.name}</Text>
                        <Text style={styles.petSubtitle}>
                          {pet.breed} • {pet.species} • {pet.sex} •{' '}
                          {pet.ageYears} yr(s)
                        </Text>
                        <Text style={styles.petBrgyText}>
                          📍 Brgy. {pet.barangay}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        pet.verificationStatus === 'verified'
                          ? styles.badgeRegistered
                          : pet.verificationStatus === 'rejected'
                          ? styles.badgeDraft
                          : styles.badgePending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          pet.verificationStatus === 'verified'
                            ? styles.badgeTextReg
                            : pet.verificationStatus === 'rejected'
                            ? styles.badgeTextDraft
                            : styles.badgeTextPending,
                        ]}
                      >
                        {pet.verificationStatus === 'verified'
                          ? `CVO ID: ${pet.officialRegistryId || 'VERIFIED'}`
                          : pet.verificationStatus === 'rejected'
                          ? 'Verification Rejected'
                          : 'Pending Verification'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>QR Passport ID:</Text>
                    <Text style={styles.infoValue}>{pet.petProfileId}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Vaccination Status:</Text>
                    <Text style={styles.infoValue}>
                      {pet.vaccinationStatus}
                    </Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.qrBtn}
                      onPress={() => setSelectedPetForQR(pet)}
                    >
                      <Text style={styles.qrBtnText}>📱 Show QR Passport</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.manageBtn}
                      onPress={() =>
                        navigation.navigate('OwnedPetPassport', { pet })
                      }
                    >
                      <Text style={styles.manageBtnText}>
                        Manage / CVO Verify
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
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
                <Text style={styles.emptySubtitle}>
                  No incoming applications yet. You can list an owned pet for
                  adoption from the Adoption or Pet Passport screen.
                </Text>
              </View>
            ) : (
              incomingApplications.map((inc) => {
                const st = String(inc.status || 'PENDING').toUpperCase();
                return (
                  <View key={String(inc.id)} style={styles.appCard}>
                    <View style={styles.appHeader}>
                      <Text style={styles.appName}>
                        Applicant: {inc.applicantName}
                      </Text>
                      <Text style={styles.appControl}>{st}</Text>
                    </View>
                    <Text style={styles.noticeText}>
                      🐾 Pet:{' '}
                      {inc.petName || inc.listingTitle || 'Adoption listing'}
                    </Text>
                    <Text style={styles.noticeText}>
                      📞 Contact: {inc.contactNumber || inc.contact_number}
                    </Text>
                    <CallButton
                      phone={inc.contactNumber || inc.contact_number}
                    />
                    <Text style={[styles.noticeText, { marginTop: 4 }]}>
                      💬 Reason: {inc.message || inc.reason_for_adoption}
                    </Text>

                    {st === 'PENDING' && (
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={[
                            styles.manageBtn,
                            { borderColor: '#D9534F' },
                          ]}
                          onPress={() =>
                            handleReviewIncoming(
                              String(inc.id),
                              inc.applicantName || 'Applicant',
                              'decline'
                            )
                          }
                        >
                          <Text style={{ color: '#D9534F', fontWeight: 'bold' }}>
                            Decline
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.qrBtn,
                            { backgroundColor: '#16A34A' },
                          ]}
                          onPress={() =>
                            handleReviewIncoming(
                              String(inc.id),
                              inc.applicantName || 'Applicant',
                              'approve'
                            )
                          }
                        >
                          <Text style={styles.qrBtnText}>Approve & Reserve</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {(st === 'APPROVED' || st === 'OWNER_APPROVED') && (
                      <TouchableOpacity
                        style={[
                          styles.qrBtn,
                          { backgroundColor: '#0284C7', marginTop: 12 },
                        ]}
                        onPress={() =>
                          handleConfirmHandover(
                            String(inc.id),
                            inc.applicantName || 'Adopter'
                          )
                        }
                      >
                        <Text style={styles.qrBtnText}>
                          🤝 Confirm Final Handover (Transfer Ownership)
                        </Text>
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
                <Text style={styles.emptyTitle}>No Submitted Applications</Text>
                <Text style={styles.emptySubtitle}>
                  Browse the Adoption tab to apply for an available companion
                  animal.
                </Text>
              </View>
            ) : (
              myApplications.map((app) => (
                <View key={String(app.id)} style={styles.appCard}>
                  <View style={styles.appHeader}>
                    <Text style={styles.appName}>
                      {app.petName ||
                        app.listingTitle ||
                        `Listing #${String(app.listingId || app.pet).slice(
                          0,
                          8
                        )}`}
                    </Text>
                    <Text style={styles.appControl}>{app.status}</Text>
                  </View>
                  <Text style={styles.noticeText}>
                    Message: {app.reason_for_adoption || app.message}
                  </Text>
                  {app.applied_at && (
                    <Text
                      style={[
                        styles.noticeText,
                        { color: '#64748B', marginTop: 4 },
                      ]}
                    >
                      Submitted: {new Date(app.applied_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'verification' && (
          <View style={styles.petCard}>
            <Text style={styles.sectionHeader}>
              CVO Pet Owner Account Verification
            </Text>
            <View style={styles.verifExplainerBanner}>
              <Text style={styles.verifExplainerText}>
                Why verify your account? Only CVO-Verified Pet Owners (green
                check badge) can submit Incident Reports and publish posts,
                comments, or votes in the Community Hub. Note: A verified pet
                alone does not verify your owner account.
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current Account Status:</Text>
              <Text style={styles.infoValue}>
                {verifStatus.toUpperCase()}
              </Text>
            </View>

            {latestVerifReq?.reviewNote ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>CVO Review Note:</Text>
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
                  <Text style={{ color: '#D9534F', fontSize: 12 }}>
                    Please add at least 1 pet in the "My Pets" tab first.
                  </Text>
                ) : (
                  <View style={styles.pickerBox}>
                    <Picker
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
                  3. Private Government ID Photo (JPG/PNG/WEBP, max 5MB)
                </Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickImageAsset(setGovIdAsset)}
                >
                  <Text style={styles.uploadBtnText}>
                    {govIdAsset
                      ? '✅ Government ID Photo Selected'
                      : '🪪 Select Private Government ID Photo'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSubmitAccountVerification}
                  disabled={isSubmittingVerif || myPets.length === 0}
                >
                  {isSubmittingVerif ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>
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
        onRequestClose={() => setIsAddPetVisible(false)}
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
              <Text style={styles.modalTitle}>Add Pet to Inventory</Text>
              <Text style={styles.modalSubtitle}>
                Creates your pet profile and generates a scannable QR Passport
                immediately.
              </Text>

              <Text style={styles.fieldLabel}>Species</Text>
              <View style={styles.radioRow}>
                {(['Dog', 'Cat'] as const).map((sp) => (
                  <TouchableOpacity
                    key={sp}
                    style={[
                      styles.radioBtn,
                      newPetSpecies === sp && styles.radioBtnActive,
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
                        newPetSpecies === sp && styles.radioBtnTextActive,
                      ]}
                    >
                      {sp}
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
                      newPetSex === sx && styles.radioBtnActive,
                    ]}
                    onPress={() => setNewPetSex(sx)}
                  >
                    <Text
                      style={[
                        styles.radioBtnText,
                        newPetSex === sx && styles.radioBtnTextActive,
                      ]}
                    >
                      {sx}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Pet Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Bantay, Mingming"
                placeholderTextColor="#94A3B8"
                value={newPetName}
                onChangeText={setNewPetName}
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
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={newPetAge}
                onChangeText={setNewPetAge}
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

              <Text style={styles.fieldLabel}>Pet Description</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Friendly Aspin in Hinaplanon"
                placeholderTextColor="#94A3B8"
                value={newPetTitle}
                onChangeText={setNewPetTitle}
              />

              <Text style={styles.fieldLabel}>
                Lost & Found Instructions (Shown on Public QR)
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="If found wandering, please call my owner immediately."
                placeholderTextColor="#94A3B8"
                value={newPetLostFoundMsg}
                onChangeText={setNewPetLostFoundMsg}
              />

              <Text style={styles.fieldLabel}>Pet Photo</Text>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImageAsset(setPetImageAsset)}
              >
                <Text style={styles.uploadBtnText}>
                  {petImageAsset ? '✅ Photo Selected' : '📷 Select Pet Photo'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>
                Public QR Passport Privacy Consent
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Share Owner Name on QR</Text>
                <Switch
                  value={shareOwnerName}
                  onValueChange={setShareOwnerName}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Share Pet Photo on QR</Text>
                <Switch
                  value={sharePublicPhoto}
                  onValueChange={setSharePublicPhoto}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share Emergency Contact on QR
                </Text>
                <Switch value={shareContact} onValueChange={setShareContact} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share Home Address on QR (Opt-In)
                </Text>
                <Switch
                  value={sharePublicAddress}
                  onValueChange={setSharePublicAddress}
                />
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsAddPetVisible(false)}
                  disabled={isSubmittingPet}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreateInventoryPet}
                  disabled={isSubmittingPet}
                >
                  {isSubmittingPet ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Pet & QR</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Edit Profile & Privacy */}
      <Modal
        visible={isEditProfileVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditProfileVisible(false)}
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
              <Text style={styles.modalTitle}>Edit Profile & Privacy</Text>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                value={editFullName}
                onChangeText={setEditFullName}
              />
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.textInput}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Barangay (Iligan City)</Text>
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
              <Text style={styles.fieldLabel}>Home Address</Text>
              <TextInput
                style={styles.textInput}
                value={editAddress}
                onChangeText={setEditAddress}
              />
              <View style={[styles.switchRow, { marginTop: 12 }]}>
                <Text style={styles.switchLabel}>
                  Show My Avatar on My Adoption Listings
                </Text>
                <Switch
                  value={shareAvatarOnListings}
                  onValueChange={setShareAvatarOnListings}
                />
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditProfileVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSaveProfileChanges}
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? (
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

      {/* Modal 3: Scannable Collar QR Modal */}
      <Modal
        visible={!!selectedPetForQR}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPetForQR(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.qrCardModal}>
            <Text style={styles.qrTitle}>CityVetHub Digital Pet Passport</Text>
            <Text style={styles.qrSubtitle}>
              {selectedPetForQR?.verificationStatus === 'verified'
                ? `✓ CVO Verified (${selectedPetForQR.officialRegistryId})`
                : 'Pending Verification • Personal QR Passport'}
            </Text>

            {selectedPetForQR && (
              <>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      getPetPassportQrUrl(selectedPetForQR.petProfileId)
                    )}`,
                  }}
                  style={{ width: 190, height: 190, marginVertical: 12 }}
                />

                <Text style={styles.qrPetName}>{selectedPetForQR.name}</Text>
                <Text style={styles.qrPetBreed}>
                  {selectedPetForQR.breed} ({selectedPetForQR.species})
                </Text>

                <View style={styles.qrDetailsBox}>
                  <Text style={styles.qrDetailText}>
                    <Text style={styles.bold}>Passport URL: </Text>
                    {getPetPassportQrUrl(selectedPetForQR.petProfileId)}
                  </Text>
                  <Text style={styles.qrDetailText}>
                    <Text style={styles.bold}>Barangay: </Text>
                    {selectedPetForQR.barangay}
                  </Text>
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.closeQrBtn}
              onPress={() => setSelectedPetForQR(null)}
            >
              <Text style={styles.closeQrText}>Close QR Card</Text>
            </TouchableOpacity>
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
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  userAvatarWrap: { position: 'relative', marginRight: 12 },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00AEEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  greenCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#16A34A',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  greenCheckText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  userName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  verifPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  verifPillGreen: { backgroundColor: '#DCFCE7' },
  verifPillAmber: { backgroundColor: '#FEF3C7' },
  verifPillGray: { backgroundColor: '#F1F5F9' },
  verifPillText: { fontSize: 9, fontWeight: 'bold' },
  userLocation: { fontSize: 12, color: '#64748B', marginTop: 1 },
  userContact: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  headerMiniActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  editProfileLink: { fontSize: 11, color: '#0284C7', fontWeight: '700' },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  segmentBtnActive: { backgroundColor: '#00AEEF' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  segmentTextActive: { color: '#FFFFFF' },
  scrollContent: { padding: 16, paddingBottom: 120 },
  sectionHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 10,
  },
  addPetBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#22C55E',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
    borderStyle: 'dashed',
  },
  addPetBtnText: { color: '#15803D', fontSize: 13, fontWeight: 'bold' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
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
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petThumb: { width: 52, height: 52, borderRadius: 10 },
  petThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petName: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  petSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  petBrgyText: { fontSize: 11, color: '#0284C7', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeRegistered: { backgroundColor: '#DCFCE7' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeDraft: { backgroundColor: '#E2E8F0' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  badgeTextReg: { color: '#166534' },
  badgeTextPending: { color: '#B45309' },
  badgeTextDraft: { color: '#475569' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  infoValue: { fontSize: 12, color: '#1E293B', fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  qrBtn: {
    flex: 1,
    backgroundColor: '#00AEEF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  qrBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  manageBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  manageBtnText: { color: '#0284C7', fontSize: 12, fontWeight: 'bold' },
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  appName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  appControl: { fontSize: 11, fontWeight: 'bold', color: '#00AEEF' },
  noticeBox: {
    backgroundColor: '#F0F9FF',
    borderLeftWidth: 3,
    borderLeftColor: '#00AEEF',
    padding: 10,
    borderRadius: 4,
    marginVertical: 8,
  },
  noticeTitle: { fontSize: 12, fontWeight: 'bold', color: '#0369A1' },
  noticeText: { fontSize: 12, color: '#334155', lineHeight: 17 },
  verifExplainerBanner: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  verifExplainerText: { fontSize: 12, color: '#166534', lineHeight: 17 },
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  radioRow: { flexDirection: 'row', gap: 8 },
  radioBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  radioBtnActive: { borderColor: '#00AEEF', backgroundColor: '#E0F2FE' },
  radioBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  radioBtnTextActive: { color: '#00AEEF', fontWeight: 'bold' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 12, color: '#334155', flex: 1 },
  uploadBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  uploadBtnText: { color: '#0284C7', fontSize: 13, fontWeight: '600' },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
  cancelBtnText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
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
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  qrTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  qrSubtitle: { fontSize: 11, color: '#16A34A', fontWeight: '700' },
  qrPetName: { fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
  qrPetBreed: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  qrDetailsBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  qrDetailText: { fontSize: 11, color: '#334155', marginBottom: 4 },
  bold: { fontWeight: 'bold' },
  closeQrBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  closeQrText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
});