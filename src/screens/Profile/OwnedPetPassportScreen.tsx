import CallButton from '../../components/CallButton';
import { useAppPalette, useThemedStyles } from '../../theme';
import BreedPicker from '../../components/BreedPicker';
import React, { useEffect, useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
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
} from 'react-native';
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
import { useAdoptionStore } from '../../store';

export default function OwnedPetPassportScreen({ route, navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
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
  const [isProcessing, setIsProcessing] = useState(false);

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
  const [healthDate, setHealthDate] = useState(
    new Date().toISOString().split('T')[0]
  );
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

  const loadFullPetData = useCallback(async () => {
    if (!petProfileId) return;
    setLoading(true);

    try {
      const profile = (await databases.getDocument(
        APPWRITE_DATABASE_ID,
        TABLES.PET_PROFILES,
        petProfileId
      )) as unknown as PetProfileRow;
      setPetDoc(profile);

      setEditName(profile.petName || '');
      setEditSpecies(profile.species === 'Cat' ? 'Cat' : 'Dog');
      setEditBreed(profile.breed || '');
      setEditColor(profile.color || '');
      setEditSex(profile.sex === 'Female' ? 'Female' : 'Male');
      setEditAge(String(profile.ageYears ?? 1));
      setEditVitalStatus(profile.vitalStatus || 'Alive');
      setEditAncestryParentId(profile.ancestryParentId || '');
      setEditBarangay(normalizeBarangay(profile.barangay));
      setEditTitle(profile.profileTitle || '');
      setEditDescription(profile.profileDescription || '');
      setEditHomeAddress(profile.homeAddress || '');
      setEditEmergencyContact(profile.emergencyContact || '');
      setEditLostFoundMsg(profile.lostFoundMessage || '');
      setEditShareOwnerName(Boolean(profile.shareOwnerName));
      setEditSharePublicPhoto(Boolean(profile.sharePublicPhoto));
      setEditShareContact(Boolean(profile.shareContact));
      setEditSharePublicAddress(Boolean(profile.sharePublicAddress));

      try {
        const parentsResponse = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          TABLES.PET_PROFILES,
          [Query.equal('ownerId', profile.ownerId), Query.limit(100)]
        );
        setPossibleParents(
          parentsResponse.documents.filter(
            (candidate) =>
              candidate.$id !== petProfileId &&
              candidate.species === profile.species
          ) as unknown as PetProfileRow[]
        );
      } catch {
        setPossibleParents([]);
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
        setMedicalRecords([]);
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
        setHealthUploads([]);
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
        setOwnershipHistory([]);
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
        setHasActiveListing(false);
      }
    } catch (error) {
      console.warn('Error loading pet profile details:', error);
    } finally {
      setLoading(false);
    }
  }, [petProfileId]);

  useEffect(() => {
    loadFullPetData();
  }, [loadFullPetData]);

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
  const qrUrl = getPetPassportQrUrl(petProfileId);
  const displayPhotoUrl =
    getMediaFileUrl(petDoc?.photoFileId) || initialPet.photoUrl;

  const handleRequestPetVerification = async () => {
    setIsProcessing(true);
    try {
      await operate('requestPetVerification', { petProfileId });
      await loadFullPetData();
      Alert.alert(
        'Sent for CVO Verification',
        'Your pet profile has been submitted to the City Veterinary Office. Once approved on the CVO Web Panel, an Official Registry ID will be assigned.'
      );
    } catch (error: any) {
      Alert.alert(
        'Verification Request Failed',
        error?.message || 'Could not request pet verification.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRepairPassport = async () => {
    setIsProcessing(true);
    try {
      await operate('ensurePetPassport', { petProfileId });
      Alert.alert(
        'Public QR Synced',
        'Public passport snapshot (`pet_passports`) is synced and active.'
      );
    } catch (error: any) {
      Alert.alert(
        'Passport Sync Notice',
        error?.message || 'Could not repair public passport row.'
      );
    } finally {
      setIsProcessing(false);
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
    setIsProcessing(true);
    try {
      let uploadedPhotoId = petDoc?.photoFileId;
      if (newPhotoAsset) {
        uploadedPhotoId = await uploadMediaFile(newPhotoAsset);
      }

      if (canEditIdentity) {
        const ageInt = parseInt(editAge, 10);
        if (isNaN(ageInt) || ageInt < 0 || ageInt > 40) {
          throw new Error('Age must be between 0 and 40 years.');
        }
        await operate('updateInventoryPet', {
          petProfileId,
          petName: editName.trim(),
          species: editSpecies,
          breed: editBreed.trim(),
          color: editColor.trim(),
          sex: editSex,
          ageYears: ageInt,
          barangay: editBarangay,
          photoFileId: uploadedPhotoId,
          vitalStatus: editVitalStatus,
          ancestryParentId: editAncestryParentId,
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
      } else {
        await operate('updatePetDetails', {
          petProfileId,
          vitalStatus: editVitalStatus,
          ancestryParentId: editAncestryParentId,
          color: editColor.trim(),
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
      }

      setIsEditModalVisible(false);
      setNewPhotoAsset(null);
      await loadFullPetData();
      Alert.alert(
        'Pet Updated',
        'Your pet profile and public QR privacy settings have been saved.'
      );
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.message || 'Could not update pet profile.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePet = () => {
    if (!canEditIdentity) {
      Alert.alert(
        'Cannot Delete',
        'Only draft or rejected pet profiles can be deleted.'
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
            }
          },
        },
      ]
    );
  };

  const handleAddHealthUpload = async () => {
    if (!healthTitle.trim() || !healthFileAsset) {
      Alert.alert(
        'Missing Fields',
        'Please provide a document title and select an image of the health/vaccination record.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      const fileId = await uploadMediaFile(healthFileAsset);
      const isoDate = new Date(
        healthDate.trim() || new Date().toISOString()
      ).toISOString();

      await operate('addPetHealthUpload', {
        petProfileId,
        title: healthTitle.trim(),
        recordDate: isoDate,
        fileId,
        sharePublic: healthSharePublic,
      });

      setIsHealthModalVisible(false);
      setHealthTitle('');
      setHealthFileAsset(null);
      await loadFullPetData();
      Alert.alert(
        'Health Document Uploaded',
        'Your personal pet health document has been saved.'
      );
    } catch (error: any) {
      Alert.alert(
        'Upload Failed',
        error?.message || 'Could not upload health document.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteHealthUpload = (recordId: string, title: string) => {
    Alert.alert(
      'Remove Document?',
      `Delete "${title}" from this pet's health uploads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await operate('deletePetHealthUpload', { recordId });
              await loadFullPetData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error?.message || 'Could not delete health document.'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateAdoptionListing = async () => {
    if (!adoptTitle.trim() || !adoptStory.trim()) {
      Alert.alert(
        'Required Fields',
        'Please enter a listing headline and your pet story/description.'
      );
      return;
    }

    setIsProcessing(true);
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
      await loadFullPetData();
      Alert.alert(
        'Listed for Adoption!',
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
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadFullPetData} />
      }
    >
      <Image
        source={{
          uri:
            displayPhotoUrl ||
            'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
        }}
        style={styles.petImage}
        resizeMode="cover"
      />

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.petName}>
              {petDoc?.petName || initialPet.name}
            </Text>
            <Text style={styles.petBreed}>
              {petDoc?.breed || initialPet.breed} •{' '}
              {petDoc?.species || initialPet.species} •{' '}
              {petDoc?.sex || initialPet.sex || 'Male'} •{' '}
              {petDoc?.ageYears ?? initialPet.ageYears ?? 1} yr(s)
            </Text>
            {petDoc?.profileTitle ? (
              <Text style={styles.profileHeadline}>
                "{petDoc.profileTitle}"
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.statusBadge,
              verifStatus === 'verified'
                ? styles.badgeReg
                : verifStatus === 'pending'
                ? styles.badgePending
                : styles.badgeDraft,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                verifStatus === 'verified'
                  ? styles.textReg
                  : verifStatus === 'pending'
                  ? styles.textPending
                  : styles.textDraft,
              ]}
            >
              {verifStatus === 'verified'
                ? '✓ CVO Verified'
                : verifStatus === 'pending'
                ? 'Pending CVO Review'
                : verifStatus === 'rejected'
                ? 'Verification Rejected'
                : 'Personal Draft'}
            </Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={() => setIsEditModalVisible(true)}
          >
            <Text style={styles.actionBtnPrimaryText}>
              ✏️ Edit Profile & QR Privacy
            </Text>
          </TouchableOpacity>

          {canEditIdentity && (
            <TouchableOpacity
              style={styles.actionBtnVerify}
              onPress={handleRequestPetVerification}
              disabled={isProcessing}
            >
              <Text style={styles.actionBtnVerifyText}>
                🛡️ Send to CVO for Official Verification
              </Text>
            </TouchableOpacity>
          )}

          {!hasActiveListing && (
            <TouchableOpacity
              style={styles.actionBtnAdopt}
              onPress={() => {
                setAdoptTitle(
                  `Adopt ${petDoc?.petName || initialPet.name} (${
                    petDoc?.breed || initialPet.breed
                  })`
                );
                setAdoptStory(
                  petDoc?.profileDescription ||
                    `${
                      petDoc?.petName || initialPet.name
                    } is looking for a loving new home in Iligan City.`
                );
                setIsAdoptModalVisible(true);
              }}
            >
              <Text style={styles.actionBtnAdoptText}>
                🏡 List Pet for Adoption
              </Text>
            </TouchableOpacity>
          )}

          {canEditIdentity && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={handleDeletePet}
              disabled={isProcessing}
            >
              <Text style={styles.actionBtnDeleteText}>
                🗑️ Delete Draft Profile
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ancestry & vital status</Text>
          <Text style={styles.petBreed}>
            Status: {petDoc?.vitalStatus || 'Alive'}
          </Text>
          <Text style={styles.petBreed}>
            Parent:{' '}
            {petDoc?.ancestryParentName ||
              possibleParents.find((p) => p.$id === petDoc?.ancestryParentId)
                ?.petName ||
              'Unknown / not listed'}
          </Text>
          <Text style={styles.petBreed}>
            Tap Edit Profile & QR Privacy above to update ancestry.
          </Text>
        </View>

        {!!petDoc?.emergencyContact && (
          <View
            style={[
              styles.sectionCard,
              { flexDirection: 'row', alignItems: 'center', gap: 10 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Emergency contact</Text>
              <Text style={styles.petBreed}>{petDoc.emergencyContact}</Text>
            </View>
            <CallButton phone={petDoc.emergencyContact} />
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            QR Digital Identification & Traceability
          </Text>

          <View style={styles.qrPlaceholderBox}>
            <Image
              source={{
                uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  qrUrl
                )}`,
              }}
              style={{ width: 165, height: 165, marginBottom: 10 }}
            />
            <Text style={styles.qrTokenText}>QR ID: {petProfileId}</Text>
            {petDoc?.officialRegistryId ? (
              <Text style={styles.officialIdText}>
                Official CVO Registry ID: {petDoc.officialRegistryId}
              </Text>
            ) : (
              <Text style={styles.qrInstruction}>
                Personal QR Active • Official Registry ID assigned after CVO
                verification
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={styles.smallQrBtn}
                onPress={handleShareQrPassport}
              >
                <Text style={styles.smallQrBtnText}>📤 Share / Save QR URL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallQrBtn, { backgroundColor: '#F1F5F9' }]}
                onPress={handleRepairPassport}
              >
                <Text style={[styles.smallQrBtnText, { color: '#334155' }]}>
                  🔄 Sync Public Row
                </Text>
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
            <View style={styles.lostBanner}>
              <Text style={styles.lostBannerTitle}>
                Lost & Found Note on Public QR:
              </Text>
              <Text style={styles.lostBannerBody}>
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
              No clinician-logged vaccinations or treatments in `medical_records`
              yet. A CVO Field Officer can scan your QR code to log official
              vaccinations.
            </Text>
          ) : (
            medicalRecords.map((rec) => (
              <View key={rec.$id} style={styles.recordItem}>
                <View style={styles.recordTopRow}>
                  <Text style={styles.recordTitle}>
                    ✓ {rec.recordType}: {rec.medicineType}
                  </Text>
                  <Text style={styles.officialBadge}>CVO Certified</Text>
                </View>
                <Text style={styles.recordMeta}>
                  Administered:{' '}
                  {new Date(rec.dateAdministered).toLocaleDateString()}
                </Text>
                {rec.description ? (
                  <Text style={styles.recordDesc}>{rec.description}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderFlex}>
            <Text style={styles.sectionTitleNoBorder}>
              Personal Health Document Uploads ({healthUploads.length})
            </Text>
            <TouchableOpacity
              style={styles.addDocBtn}
              onPress={() => setIsHealthModalVisible(true)}
            >
              <Text style={styles.addDocBtnText}>+ Upload Card</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.unverifiedNotice}>
            Label: Owner supplied — not clinician verified
          </Text>

          {healthUploads.length === 0 ? (
            <Text style={styles.emptyText}>
              Upload photos of your pet's physical vaccination booklet or
              private clinic receipts here.
            </Text>
          ) : (
            healthUploads.map((up) => (
              <View key={up.$id} style={styles.uploadCard}>
                {getMediaFileUrl(up.fileId) && (
                  <Image
                    source={{ uri: getMediaFileUrl(up.fileId) }}
                    style={styles.uploadThumb}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordTitle}>{up.title}</Text>
                  <Text style={styles.recordMeta}>
                    Date: {new Date(up.recordDate).toLocaleDateString()} •{' '}
                    {up.sharePublic ? '🌐 Public on QR' : '🔒 Private'}
                  </Text>
                  <Text style={styles.ownerSuppliedTag}>
                    Owner supplied — not CVO certified
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteHealthUpload(up.$id, up.title)}
                >
                  <Text style={styles.deleteLink}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
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
              <View key={evt.$id} style={styles.recordItem}>
                <Text style={styles.recordTitle}>
                  {evt.transferType} Transfer
                </Text>
                <Text style={styles.recordDesc}>
                  From: {evt.previousOwnerName || evt.previousOwnerId} → To:{' '}
                  {evt.newOwnerName || evt.newOwnerId}
                </Text>
                <Text style={styles.recordMeta}>
                  Date: {new Date(evt.transferDate).toLocaleString()}
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
        onRequestClose={() => setIsEditModalVisible(false)}
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
              <Text style={styles.modalTitle}>
                {canEditIdentity
                  ? 'Edit Pet Profile & QR Privacy'
                  : 'Update Public Passport & Privacy'}
              </Text>

              {canEditIdentity && (
                <>
                  <Text style={styles.fieldLabel}>Pet Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <Text style={styles.fieldLabel}>Breed</Text>
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
                  />
                  <Text style={styles.fieldLabel}>Barangay</Text>
                  <View style={styles.pickerBox}>
                    <Picker
                      selectedValue={editBarangay}
                      onValueChange={(v) =>
                        setEditBarangay(v as IliganBarangay)
                      }
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
                  >
                    <Text style={styles.uploadBtnText}>
                      {newPhotoAsset
                        ? '✅ New Photo Selected'
                        : '📷 Replace Pet Photo'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.fieldLabel}>Coat color</Text>
              <TextInput
                style={styles.textInput}
                value={editColor}
                onChangeText={setEditColor}
                maxLength={50}
                placeholder="e.g. Black, white, brown, tabby"
                placeholderTextColor="#94A3B8"
              />
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
              <Text style={styles.fieldLabel}>Ancestry — linked parent</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={editAncestryParentId}
                  onValueChange={setEditAncestryParentId}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Unknown / not listed" value="" />
                  {possibleParents.map((parent) => (
                    <Picker.Item
                      key={parent.$id}
                      label={`${parent.petName} · ${parent.breed}`}
                      value={parent.$id}
                    />
                  ))}
                  {!!petDoc?.ancestryParentId &&
                    !possibleParents.some(
                      (p) => p.$id === petDoc.ancestryParentId
                    ) && (
                      <Picker.Item
                        label={`${
                          petDoc.ancestryParentName || 'Historical parent'
                        } (retained)`}
                        value={petDoc.ancestryParentId}
                      />
                    )}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Passport Headline / Title</Text>
              <TextInput
                style={styles.textInput}
                value={editTitle}
                onChangeText={setEditTitle}
              />

              <Text style={styles.fieldLabel}>Pet Description / Notes</Text>
              <TextInput
                style={[styles.textInput, { height: 65 }]}
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
              />

              <Text style={styles.fieldLabel}>Emergency Contact Phone</Text>
              <TextInput
                style={styles.textInput}
                value={editEmergencyContact}
                onChangeText={setEditEmergencyContact}
              />

              <Text style={styles.fieldLabel}>Home Address</Text>
              <TextInput
                style={styles.textInput}
                value={editHomeAddress}
                onChangeText={setEditHomeAddress}
              />

              <Text style={styles.fieldLabel}>Lost & Found Message</Text>
              <TextInput
                style={styles.textInput}
                value={editLostFoundMsg}
                onChangeText={setEditLostFoundMsg}
                placeholder="Instructions if someone scans your lost pet's QR"
              />

              <Text style={styles.fieldLabel}>
                Public QR Data-Sharing Toggles
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show Owner Name on QR</Text>
                <Switch
                  value={editShareOwnerName}
                  onValueChange={setEditShareOwnerName}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show Pet Photo on QR</Text>
                <Switch
                  value={editSharePublicPhoto}
                  onValueChange={setEditSharePublicPhoto}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show Emergency Phone on QR
                </Text>
                <Switch
                  value={editShareContact}
                  onValueChange={setEditShareContact}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show Home Address on QR (Opt-In)
                </Text>
                <Switch
                  value={editSharePublicAddress}
                  onValueChange={setEditSharePublicAddress}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSavePetEdits}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
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
        onRequestClose={() => setIsHealthModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={styles.modalTitle}>
                Upload Personal Health Document
              </Text>
              <Text style={styles.modalSub}>
                Attach a dated vaccination booklet page or vet receipt (labeled
                as owner-supplied).
              </Text>

              <Text style={styles.fieldLabel}>Document Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2026 Anti-Rabies Booster Card"
                value={healthTitle}
                onChangeText={setHealthTitle}
              />

              <Text style={styles.fieldLabel}>Record Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="2026-11-10"
                value={healthDate}
                onChangeText={setHealthDate}
              />

              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => pickImage(setHealthFileAsset)}
              >
                <Text style={styles.uploadBtnText}>
                  {healthFileAsset
                    ? '✅ Document Image Selected'
                    : '📄 Select Document Image (Max 5MB)'}
                </Text>
              </TouchableOpacity>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Share this document on public QR passport
                </Text>
                <Switch
                  value={healthSharePublic}
                  onValueChange={setHealthSharePublic}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsHealthModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddHealthUpload}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
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
        onRequestClose={() => setIsAdoptModalVisible(false)}
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
              <Text style={styles.modalTitle}>
                List {petDoc?.petName || initialPet.name} for Adoption
              </Text>
              <Text style={styles.modalSub}>
                Publishes your pet to the CityVetHub Adoption Feed. You review
                applications and confirm final handover directly.
              </Text>

              <Text style={styles.fieldLabel}>Listing Headline *</Text>
              <TextInput
                style={styles.textInput}
                value={adoptTitle}
                onChangeText={setAdoptTitle}
              />

              <Text style={styles.fieldLabel}>Pet Story & Temperament *</Text>
              <TextInput
                style={[styles.textInput, { height: 75 }]}
                value={adoptStory}
                onChangeText={setAdoptStory}
                multiline
              />

              <Text style={styles.fieldLabel}>Adopter Requirements</Text>
              <TextInput
                style={styles.textInput}
                value={adoptRequirements}
                onChangeText={setAdoptRequirements}
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

              <Text style={styles.fieldLabel}>Listing Privacy & Consent</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Publish Pet Photo</Text>
                <Switch
                  value={publishPetPhoto}
                  onValueChange={setPublishPetPhoto}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show My Name on Listing</Text>
                <Switch
                  value={showOwnerName}
                  onValueChange={setShowOwnerName}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Show My Profile Avatar on Listing
                </Text>
                <Switch
                  value={publishOwnerPhoto}
                  onValueChange={setPublishOwnerPhoto}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsAdoptModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreateAdoptionListing}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
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
  petImage: { width: '100%', height: 240, backgroundColor: '#E2E8F0' },
  contentContainer: {
    padding: 16,
    marginTop: -20,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  petName: { fontSize: 24, fontWeight: 'bold', color: '#1E293B' },
  petBreed: { fontSize: 13, color: '#64748B', marginTop: 2 },
  profileHeadline: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#0284C7',
    marginTop: 4,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  badgeReg: { backgroundColor: '#DCFCE7' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeDraft: { backgroundColor: '#E2E8F0' },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  textReg: { color: '#166534' },
  textPending: { color: '#B45309' },
  textDraft: { color: '#334155' },
  actionGrid: { gap: 8, marginBottom: 16 },
  actionBtnPrimary: {
    backgroundColor: '#00AEEF',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnPrimaryText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  actionBtnVerify: {
    backgroundColor: '#16A34A',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnVerifyText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  actionBtnAdopt: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnAdoptText: { color: '#0284C7', fontWeight: 'bold', fontSize: 13 },
  actionBtnDelete: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDeleteText: { color: '#D9534F', fontWeight: '600', fontSize: 12 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  sectionHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleNoBorder: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  unverifiedNotice: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 10,
  },
  addDocBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addDocBtnText: { color: '#0284C7', fontSize: 12, fontWeight: 'bold' },
  qrPlaceholderBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrTokenText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00AEEF',
    marginBottom: 2,
  },
  officialIdText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#166534',
    marginTop: 2,
  },
  qrInstruction: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  smallQrBtn: {
    backgroundColor: '#00AEEF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  smallQrBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dataLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  dataValue: { fontSize: 12, color: '#1E293B', fontWeight: 'bold' },
  lostBanner: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  lostBannerTitle: { fontSize: 11, fontWeight: 'bold', color: '#92400E' },
  lostBannerBody: { fontSize: 12, color: '#78350F', marginTop: 2 },
  emptyText: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  recordItem: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#00AEEF',
  },
  recordTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordTitle: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  officialBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  recordDesc: { fontSize: 12, color: '#334155', marginTop: 4 },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  uploadThumb: { width: 48, height: 48, borderRadius: 6 },
  ownerSuppliedTag: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 2,
  },
  deleteLink: { color: '#D9534F', fontSize: 12, fontWeight: 'bold' },
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
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
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
  uploadBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  uploadBtnText: { color: '#0284C7', fontSize: 13, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 12, color: '#334155', flex: 1 },
  modalActions: {
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
  cancelBtnText: { color: '#64748B', fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});