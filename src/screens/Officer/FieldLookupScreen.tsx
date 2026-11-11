import CallButton from '../../components/CallButton';
import NotificationBell from '../../components/NotificationBell';
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Query } from 'react-native-appwrite';
import { useAuthStore } from '../../store';
import {
  databases,
  operate,
  getMediaFileUrl,
  APPWRITE_DATABASE_ID,
  TABLES,
} from '../../api/client';

interface LookupPetView {
  $id: string; // Verified `pets.$id` or `pet_passports.$id`
  petProfileId: string;
  officialPetId?: string; // Present if officially verified in `pets`
  officialRegistryId?: string;
  verificationStatus: 'draft' | 'pending' | 'verified' | 'rejected';
  ownerId?: string;
  ownerName: string;
  contact?: string;
  displayAddress?: string;
  lostFoundMessage?: string;
  petName: string;
  species: string;
  breed: string;
  sex: string;
  ageYears: number;
  barangay: string;
  vaccinationStatus?: string;
  photoUrl?: string;
}

interface MedicalRecordItem {
  $id: string;
  petId: string;
  veterinarianId: string;
  recordType: 'Vaccination' | 'Treatment' | string;
  medicineType: string;
  description: string;
  dateAdministered: string;
  recorderNameSnapshot?: string;
  recorderName?: string;
}

interface OwnershipHistoryItem {
  $id: string;
  petId: string;
  previousOwnerId: string;
  newOwnerId: string;
  previousOwnerName?: string;
  newOwnerName?: string;
  transferType: string;
  transferDate: string;
}

export default function FieldLookupScreen() {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [tokenInput, setTokenInput] = useState('');
  const [directoryPets, setDirectoryPets] = useState<LookupPetView[]>([]);
  const [searchedPet, setSearchedPet] = useState<LookupPetView | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecordItem[]>([]);
  const [ownershipHistory, setOwnershipHistory] = useState<
    OwnershipHistoryItem[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add Official Medical / Vaccination Modal (`addMedical` — Vaccination | Treatment only)
  const [isMedModalVisible, setIsMedModalVisible] = useState(false);
  const [recordType, setRecordType] = useState<'Vaccination' | 'Treatment'>(
    'Vaccination'
  );
  const [medicineType, setMedicineType] = useState('Anti-Rabies (Rabisin)');
  const [medDescription, setMedDescription] = useState('');
  const [dateAdministered, setDateAdministered] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmittingMed, setIsSubmittingMed] = useState(false);

  // Live Camera QR Scanner Modal State
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualScanToken, setManualScanToken] = useState('');
  const [hasScannedLock, setHasScannedLock] = useState(false);

  const mapVerifiedPetDoc = (doc: any): LookupPetView => ({
    $id: doc.$id,
    petProfileId: doc.petProfileId || doc.$id,
    officialPetId: doc.$id,
    officialRegistryId:
      doc.officialRegistryId ||
      `CVO-${String(doc.$id).slice(0, 6).toUpperCase()}`,
    verificationStatus: 'verified',
    ownerId: doc.ownerId,
    ownerName: doc.ownerName || 'Verified Owner',
    contact: doc.emergencyContact || '',
    displayAddress: doc.homeAddress || '',
    lostFoundMessage: doc.lostFoundMessage || '',
    petName: doc.petName || 'Companion',
    species: doc.species || 'Dog',
    breed: doc.breed || 'Aspin',
    sex: doc.sex || 'Male',
    ageYears: typeof doc.ageYears === 'number' ? doc.ageYears : 1,
    barangay: doc.barangay || 'Poblacion',
    vaccinationStatus: doc.vaccinationStatus || 'Verified',
    photoUrl: doc.imageUrl || getMediaFileUrl(doc.photoFileId),
  });

  const loadPetMedicalAndHistory = useCallback(
    async (petView: LookupPetView) => {
      const candidateIds = Array.from(
        new Set(
          [petView.officialPetId, petView.petProfileId, petView.$id].filter(
            Boolean
          ) as string[]
        )
      );

      try {
        const medRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          TABLES.MEDICAL_RECORDS,
          [
            Query.equal('petId', candidateIds),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ]
        );
        const medical = medRes.documents as unknown as MedicalRecordItem[];
        const missing = medical.filter(item => !item.recorderNameSnapshot && !item.recorderName).map(item => item.$id);
        if (missing.length) {
          try {
            const resolved = await operate<{ recorders?: { recordId: string; recorderName: string }[] }>(
              'resolveMedicalRecorders', { recordIds: missing.slice(0, 100) });
            const byId = new Map((resolved.recorders || []).map(r => [r.recordId, r.recorderName]));
            medical.forEach(item => { if (!item.recorderNameSnapshot) item.recorderName = byId.get(item.$id); });
          } catch { /* Names remain snapshots or authorized fallback only */ }
        }
        setMedicalRecords(medical);
      } catch {
        setMedicalRecords([]);
      }

      try {
        const histRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          TABLES.OWNERSHIP_HISTORY,
          [
            Query.equal('petId', candidateIds),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ]
        );
        setOwnershipHistory(
          histRes.documents as unknown as OwnershipHistoryItem[]
        );
      } catch {
        setOwnershipHistory([]);
      }
    },
    []
  );

  const fetchVerifiedDirectory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Server-safe staff directory is the same source used by the CVO Web panel.
      // It handles Appwrite row-level permissions and supplies short-lived photos.
      let rows: any[] = [];
      try {
        const remote = await operate<{ pets?: any[] }>('getStaffPetDirectory', {});
        rows = Array.isArray(remote?.pets) ? remote.pets : [];
      } catch (err) {
        console.warn('Staff directory Function unavailable; trying accessible registry rows:', err);
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, TABLES.PETS,
          [Query.orderDesc('$createdAt'), Query.limit(100)]);
        rows = res.documents;
      }
      setDirectoryPets(rows.map(mapVerifiedPetDoc));
    } catch (error) {
      console.warn('Failed to load verified pets directory:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVerifiedDirectory();
  }, [fetchVerifiedDirectory]);

  /**
   * Parses a scanned QR string (`https://.../passport.html?pet=<id>`) or raw ID/Registry ID
   */
  const parseQrPayload = (raw: string): string => {
    const trimmed = raw.trim();
    const matchParam = trimmed.match(/[?&]pet=([a-zA-Z0-9_-]+)/i);
    if (matchParam && matchParam[1]) {
      return matchParam[1];
    }
    return trimmed.replace(/^ILG-PET-/i, '');
  };

  const handleSelectPet = async (pet: LookupPetView) => {
    setSearchedPet(pet);
    setTokenInput(pet.officialRegistryId || pet.petProfileId);
    setIsLoading(true);
    await loadPetMedicalAndHistory(pet);
    setIsLoading(false);
  };

  const handleLookup = async (overrideInput?: string) => {
    const rawQuery = (overrideInput ?? tokenInput).trim();
    if (!rawQuery) {
      Alert.alert(
        'Missing Input',
        'Scan a Pet QR code or enter a Pet ID, Official Registry ID, Pet Name, or Owner Name.'
      );
      return;
    }

    setIsLoading(true);
    const extractedId = parseQrPayload(rawQuery);

    try {
      // 1. Check public `pet_passports` first if it's a direct QR scan ID
      let passportDoc: any = null;
      try {
        passportDoc = await databases.getDocument(
          APPWRITE_DATABASE_ID,
          TABLES.PET_PASSPORTS,
          extractedId
        );
      } catch {
        passportDoc = null;
      }

      // 2. Query verified `pets` table for authorized private record
      let allVerified: LookupPetView[];
      try {
        const remote = await operate<{ pets?: any[] }>('getStaffPetDirectory', {});
        allVerified = (remote.pets || []).map(mapVerifiedPetDoc);
      } catch {
        const petsRes = await databases.listDocuments(APPWRITE_DATABASE_ID, TABLES.PETS, [Query.limit(100)]);
        allVerified = petsRes.documents.map(mapVerifiedPetDoc);
      }
      setDirectoryPets(allVerified);

      const matchedVerified = allVerified.find(
        (p) =>
          p.$id.toLowerCase() === extractedId.toLowerCase() ||
          p.petProfileId.toLowerCase() === extractedId.toLowerCase() ||
          (p.officialRegistryId || '').toLowerCase() ===
            rawQuery.toLowerCase() ||
          p.petName.toLowerCase().includes(rawQuery.toLowerCase()) ||
          p.ownerName.toLowerCase().includes(rawQuery.toLowerCase())
      );

      if (matchedVerified) {
        setSearchedPet(matchedVerified);
        await loadPetMedicalAndHistory(matchedVerified);
      } else if (passportDoc) {
        // Unverified Personal QR Passport found in `pet_passports`
        const publicView: LookupPetView = {
          $id: passportDoc.$id,
          petProfileId: passportDoc.$id,
          officialPetId: undefined,
          officialRegistryId: passportDoc.officialRegistryId || undefined,
          verificationStatus: passportDoc.verificationStatus || 'draft',
          ownerName: passportDoc.ownerName || 'Private (Owner Not Shared)',
          contact: passportDoc.contact || '',
          displayAddress: passportDoc.displayAddress || '',
          lostFoundMessage: passportDoc.lostFoundMessage || '',
          petName: passportDoc.petName || 'Personal QR Pet',
          species: passportDoc.species || 'Dog',
          breed: passportDoc.breed || 'Aspin',
          sex: passportDoc.sex || 'Male',
          ageYears:
            typeof passportDoc.ageYears === 'number' ? passportDoc.ageYears : 1,
          barangay: passportDoc.barangay || 'Poblacion',
          vaccinationStatus:
            passportDoc.vaccinationStatus || 'Unverified Personal QR',
          photoUrl: getMediaFileUrl(passportDoc.photoFileId),
        };
        setSearchedPet(publicView);
        await loadPetMedicalAndHistory(publicView);
      } else {
        setSearchedPet(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        Alert.alert(
          'No Matching Pet Record',
          `No public QR passport or verified CVO pet matched "${rawQuery}".`
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Lookup Error',
        error?.message || 'Unable to query pet registry.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMedicalRecord = async () => {
    if (!searchedPet) return;
    if (!searchedPet.officialPetId) {
      Alert.alert(
        'CVO Pet Verification Required',
        'Official clinical and vaccination records can only be added to CVO-verified pets. Ask the owner to submit their pet for CVO verification first.'
      );
      return;
    }

    if (!medicineType.trim() || !dateAdministered.trim()) {
      Alert.alert(
        'Required Fields',
        'Please specify the vaccine/medicine name and date administered.'
      );
      return;
    }

    setIsSubmittingMed(true);
    try {
      const isoDate = new Date(
        dateAdministered.trim() || new Date().toISOString()
      ).toISOString();

      await operate('addMedical', {
        petId: searchedPet.officialPetId,
        recordType,
        medicineType: medicineType.trim(),
        description:
          medDescription.trim() ||
          `${recordType} recorded by Field Officer ${user?.fullName || ''}.`,
        dateAdministered: isoDate,
      });

      setIsMedModalVisible(false);
      setMedDescription('');
      await loadPetMedicalAndHistory(searchedPet);

      Alert.alert(
        'Saved successfully',
        `${recordType} (${medicineType}) has been added to ${searchedPet.petName}'s official veterinary record.`
      );
    } catch (error: any) {
      Alert.alert(
        'Medical Log Failed',
        error?.message || 'Could not create official medical entry.'
      );
    } finally {
      setIsSubmittingMed(false);
    }
  };

  const openQrScanner = async () => {
    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Needed',
          'You can still paste or select a QR token manually in the scanner dialog.'
        );
      }
    }
    setHasScannedLock(false);
    setManualScanToken('');
    setIsScannerVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Officer Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>CVO Field Registry & QR Lookup</Text>
          <Text style={styles.headerSubtitle}>
            Officer: {user?.fullName} • Area: Brgy.{' '}
            {user?.assignedArea || user?.barangay}
          </Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={fetchVerifiedDirectory}
          />
        }
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.instructionTitle}>
              Scan Collar QR or Search Registry
            </Text>
            <Text style={styles.instructionBody}>
              Look up companion animals by scanning their collar QR code or
              searching by Registry ID, pet name, or owner name.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.qrScanTriggerBtn}
            onPress={openQrScanner}
          >
            <Text style={styles.qrScanTriggerIcon}>📷</Text>
            <Text style={styles.qrScanTriggerText}>Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            placeholder="Official ID, Pet ID, Pet Name, or Owner..."
            placeholderTextColor="#94A3B8"
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => handleLookup()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.searchBtnText}>Lookup</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Verified Pet Chips */}
        <View style={styles.quickDirectorySection}>
          <Text style={styles.quickSectionLabel}>
            Verified Municipal Pets ({directoryPets.length} records):
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {directoryPets.length === 0 ? (
              <Text style={styles.emptyChipsText}>
                No verified pets found yet.
              </Text>
            ) : (
              directoryPets.map((pet) => {
                const isSelected = searchedPet?.$id === pet.$id;
                return (
                  <TouchableOpacity
                    key={pet.$id}
                    style={[styles.petChip, isSelected && styles.petChipActive]}
                    onPress={() => handleSelectPet(pet)}
                  >
                    <Text
                      style={[
                        styles.petChipName,
                        isSelected && styles.petChipTextActive,
                      ]}
                    >
                      {pet.species === 'Cat' ? '🐱' : '🐶'} {pet.petName}
                    </Text>
                    <Text
                      style={[
                        styles.petChipToken,
                        isSelected && styles.petChipTextActive,
                      ]}
                    >
                      {pet.officialRegistryId || pet.$id.slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Lookup Result Card */}
        {searchedPet && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                {searchedPet.photoUrl ? (
                  <Image
                    source={{ uri: searchedPet.photoUrl }}
                    style={{ width: 56, height: 56, borderRadius: 10 }}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.petName}>{searchedPet.petName}</Text>
                  <Text style={styles.petMetaSub}>
                    {searchedPet.breed} • {searchedPet.species} •{' '}
                    {searchedPet.sex} • {searchedPet.ageYears} yr(s)
                  </Text>
                  <Text style={styles.petToken}>
                    {searchedPet.officialRegistryId
                      ? `Official ID: ${searchedPet.officialRegistryId}`
                      : `QR ID: ${searchedPet.petProfileId}`}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.badge,
                  searchedPet.officialPetId
                    ? styles.badgeReg
                    : styles.badgeUnverified,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    searchedPet.officialPetId
                      ? styles.badgeTextReg
                      : styles.badgeTextUnverified,
                  ]}
                >
                  {searchedPet.officialPetId
                    ? '✓ CVO Verified'
                    : 'Personal QR Only'}
                </Text>
              </View>
            </View>

            <View style={styles.dataSection}>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Owner:</Text>
                <Text style={styles.dataValue}>{searchedPet.ownerName}</Text>
              </View>
              {searchedPet.contact ? (
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Emergency Contact:</Text>
                  <Text style={styles.dataValue}>{searchedPet.contact}</Text>
                  <CallButton phone={searchedPet.contact}/>
                </View>
              ) : null}
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Barangay:</Text>
                <Text style={styles.dataValue}>
                  Brgy. {searchedPet.barangay}, Iligan City
                </Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Vaccination Indicator:</Text>
                <Text style={styles.dataValueHighlight}>
                  {medicalRecords.length > 0
                    ? 'Vaccination recorded'
                    : searchedPet.vaccinationStatus || 'No official record'}
                </Text>
              </View>
            </View>

            {/* Officer Action Bar: Log Official Vaccination / Treatment */}
            {searchedPet.officialPetId ? (
              <View style={styles.actionContainer}>
                <TouchableOpacity
                  style={styles.logMedicalBtn}
                  onPress={() => setIsMedModalVisible(true)}
                >
                  <Text style={styles.logMedicalBtnText}>
                    💉 + Record Official Vaccination / Treatment
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.unverifiedBanner}>
                <Text style={styles.unverifiedBannerText}>
                  This QR code belongs to an unverified personal pet profile.
                  Official medical entries require CVO pet verification first.
                </Text>
              </View>
            )}

            {/* Official Medical & Vaccination History */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>
                Official Clinical & Vaccination History ({medicalRecords.length}
                )
              </Text>
              {medicalRecords.length === 0 ? (
                <Text style={styles.emptyRecordText}>
                  No official veterinary records logged yet.
                </Text>
              ) : (
                medicalRecords.map((rec) => (
                  <View key={rec.$id} style={styles.recordCard}>
                    <View style={styles.recordHeaderRow}>
                      <Text style={styles.recordTypeBadge}>
                        {rec.recordType}
                      </Text>
                      <Text style={styles.recordDate}>
                        {new Date(rec.dateAdministered).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.recordMedName}>{rec.medicineType}</Text>
                    <Text style={styles.recordDesc}>{rec.description}</Text>
                    {(rec.recorderNameSnapshot || rec.recorderName) ? (
                      <Text style={[styles.recordDate, { marginTop: 4 }]}>
                        Recorded by: {rec.recorderNameSnapshot || rec.recorderName}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {/* Ownership History */}
            {ownershipHistory.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>
                  Ownership History ({ownershipHistory.length})
                </Text>
                {ownershipHistory.map((h) => (
                  <View key={h.$id} style={styles.recordCard}>
                    <Text style={styles.recordMedName}>{h.transferType}</Text>
                    <Text style={styles.recordDesc}>
                      {h.previousOwnerName || h.previousOwnerId} →{' '}
                      {h.newOwnerName || h.newOwnerId} (
                      {new Date(h.transferDate).toLocaleDateString()})
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal 1: Live Camera QR Scanner + Manual Input */}
      <Modal
        visible={isScannerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsScannerVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(20, insets.bottom + 12) },
            ]}
          >
            <View style={styles.scannerHeaderRow}>
              <Text style={styles.modalTitle}>Scan Pet Passport QR</Text>
              <TouchableOpacity
                style={styles.torchBtn}
                onPress={() => setTorchEnabled(!torchEnabled)}
              >
                <Text style={styles.torchBtnText}>
                  {torchEnabled ? '🔦 Torch ON' : '🔦 Torch OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {cameraPermission?.granted ? (
              <View style={styles.cameraContainer}>
                <CameraView
                  style={{ flex: 1 }}
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(result) => {
                    if (hasScannedLock || !result?.data) return;
                    setHasScannedLock(true);
                    setIsScannerVisible(false);
                    const extracted = parseQrPayload(result.data);
                    setTokenInput(extracted);
                    handleLookup(result.data);
                  }}
                />
              </View>
            ) : (
              <View style={styles.cameraFrame}>
                <Text style={styles.cameraFrameText}>
                  Camera permission not granted — paste QR URL or Pet ID below.
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>
              Or Paste QR URL / Pet Profile ID / Official Registry ID
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="passport.html?pet=... or Official ID"
              placeholderTextColor="#94A3B8"
              value={manualScanToken}
              onChangeText={setManualScanToken}
              autoCapitalize="none"
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsScannerVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => {
                  setIsScannerVisible(false);
                  if (manualScanToken.trim()) {
                    setTokenInput(manualScanToken.trim());
                    handleLookup(manualScanToken.trim());
                  }
                }}
              >
                <Text style={styles.submitBtnText}>Lookup QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Add Official Medical Record (`addMedical`) */}
      <Modal
        visible={isMedModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsMedModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View
            style={[
              styles.modalCard,
              {
                maxHeight: '90%',
                paddingBottom: Math.max(20, insets.bottom + 12),
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: Math.max(16, insets.bottom + 8),
              }}
            >
              <Text style={styles.modalTitle}>
                Record Official Vaccination / Treatment
              </Text>
              <Text style={styles.modalSub}>
                Patient: {searchedPet?.petName} (
                {searchedPet?.officialRegistryId || searchedPet?.$id})
              </Text>

              <Text style={styles.fieldLabel}>Record Type</Text>
              <View style={styles.typeRow}>
                {(['Vaccination', 'Treatment'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typePill,
                      recordType === type && styles.typePillActive,
                    ]}
                    onPress={() => {
                      setRecordType(type);
                      setMedicineType(
                        type === 'Vaccination'
                          ? 'Anti-Rabies (Rabisin)'
                          : 'Clinical Veterinary Treatment'
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.typePillText,
                        recordType === type && styles.typePillTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Vaccine / Medicine Type *</Text>
              <TextInput
                style={styles.modalInput}
                value={medicineType}
                onChangeText={setMedicineType}
              />

              <Text style={styles.fieldLabel}>
                Date Administered (YYYY-MM-DD) *
              </Text>
              <TextInput
                style={styles.modalInput}
                value={dateAdministered}
                onChangeText={setDateAdministered}
              />

              <Text style={styles.fieldLabel}>
                Clinical Notes / Batch Number
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { height: 70, textAlignVertical: 'top' },
                ]}
                placeholder="Enter batch number, dosage, or clinical notes..."
                placeholderTextColor="#94A3B8"
                value={medDescription}
                onChangeText={setMedDescription}
                multiline
              />

              <View
                style={[
                  styles.modalActionRow,
                  { marginBottom: Math.max(8, insets.bottom) },
                ]}
              >
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsMedModalVisible(false)}
                  disabled={isSubmittingMed}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddMedicalRecord}
                  disabled={isSubmittingMed}
                >
                  {isSubmittingMed ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      Save Official Entry
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  logoutText: { color: '#FCA5A5', fontSize: 12, fontWeight: 'bold' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  instructionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  instructionBody: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  qrScanTriggerBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  qrScanTriggerIcon: { fontSize: 18, marginBottom: 2 },
  qrScanTriggerText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  searchBox: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: '#1E293B',
  },
  searchBtn: {
    backgroundColor: '#00AEEF',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  searchBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  quickDirectorySection: { marginBottom: 20 },
  quickSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emptyChipsText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  petChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  petChipActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  petChipName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  petChipToken: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  petChipTextActive: { color: '#FFFFFF' },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  resultHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { fontSize: 19, fontWeight: 'bold', color: '#1E293B' },
  petMetaSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  petToken: { fontSize: 12, color: '#00AEEF', fontWeight: '700', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  badgeReg: { backgroundColor: '#DCFCE7' },
  badgeUnverified: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextReg: { color: '#166534' },
  badgeTextUnverified: { color: '#B45309' },
  dataSection: { paddingVertical: 8 },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dataLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  dataValue: { fontSize: 13, color: '#1E293B', fontWeight: '700' },
  dataValueHighlight: { fontSize: 13, color: '#15803D', fontWeight: '700' },
  actionContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  logMedicalBtn: {
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  logMedicalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  unverifiedBanner: {
    margin: 16,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  unverifiedBannerText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  subSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 10,
  },
  emptyRecordText: { fontSize: 12, color: '#94A3B8' },
  recordCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#00AEEF',
  },
  recordHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recordTypeBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  recordDate: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  recordMedName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  recordDesc: { fontSize: 12, color: '#475569', marginTop: 2 },
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
  },
  scannerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  torchBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  torchBtnText: { fontSize: 12, fontWeight: 'bold', color: '#1E293B' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  cameraContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#00AEEF',
  },
  cameraFrame: {
    height: 140,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    marginBottom: 14,
  },
  cameraFrameText: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typePill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  typePillActive: { backgroundColor: '#E0F2FE', borderColor: '#00AEEF' },
  typePillText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  typePillTextActive: { color: '#00AEEF', fontWeight: 'bold' },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 6,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});