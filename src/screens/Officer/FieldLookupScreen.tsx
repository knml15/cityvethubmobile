import CallButton from '../../components/CallButton';
import NotificationBell from '../../components/NotificationBell';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveSync } from '../../utils/useLiveSync';
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
  Keyboard,
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
  expiryDate?: string;
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

const VACCINE_TREATMENT_PRESETS = [
  'Anti-Rabies Vaccine',
  '5-in-1 Canine Vaccine (DHPPiL)',
  '4-in-1 Feline Vaccine (FVRCP)',
  'Deworming (Praziquantel / Pyrantel)',
  'Tick & Flea Preventative',
  'Antibiotic Therapy',
  'Wound Dressing & Antiseptic Care',
] as const;

const DEFAULT_VACCINE_PRESET = VACCINE_TREATMENT_PRESETS[0];
const DEFAULT_TREATMENT_PRESET = VACCINE_TREATMENT_PRESETS[3];

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

function extractRecordExpiry(rec: MedicalRecordItem): {
  expiryStr: string | null;
  cleanDescription: string;
  status: 'expired' | 'soon' | 'valid' | null;
} {
  const rawDesc = rec.description || '';
  const descMatch = rawDesc.match(/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]/i);
  const expiryStr = (rec.expiryDate || descMatch?.[1] || '').trim() || null;
  const cleanDescription = descMatch ? rawDesc.replace(descMatch[0], '').trim() : rawDesc;

  if (!expiryStr) {
    return { expiryStr: null, cleanDescription, status: null };
  }

  const expDate = parseStrictYmd(expiryStr) || new Date(expiryStr);
  if (Number.isNaN(expDate.getTime())) {
    return { expiryStr, cleanDescription, status: 'valid' };
  }

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
  const diffDays = Math.ceil((expMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { expiryStr, cleanDescription, status: 'expired' };
  if (diffDays <= 30) return { expiryStr, cleanDescription, status: 'soon' };
  return { expiryStr, cleanDescription, status: 'valid' };
}

export default function FieldLookupScreen() {
  const palette = useAppPalette();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const isDark = user?.theme === 'dark';

  const semanticColors = useMemo(
    () => ({
      successBg: isDark ? '#143326' : '#DCFCE7',
      successText: isDark ? '#6EE7B7' : '#166534',
      successBorder: isDark ? '#1F4D3A' : '#86EFAC',
      warningBg: isDark ? '#3B2B12' : '#FEF3C7',
      warningText: isDark ? '#FCD34D' : '#B45309',
      warningBorder: isDark ? '#5C431C' : '#FDE68A',
      dangerBg: isDark ? '#3E1C24' : '#FEE2E2',
      dangerText: palette.danger,
      dangerBorder: isDark ? '#662A36' : '#FCA5A5',
      headerBg: isDark ? '#0D1520' : '#162337',
    }),
    [isDark, palette.danger]
  );

  const [tokenInput, setTokenInput] = useState('');
  const [lookupNotFoundQuery, setLookupNotFoundQuery] = useState<string | null>(null);
  const [directoryPets, setDirectoryPets] = useState<LookupPetView[]>([]);
  const [hasLoadedDirectory, setHasLoadedDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [matchingCandidates, setMatchingCandidates] = useState<LookupPetView[]>([]);
  const [searchedPet, setSearchedPet] = useState<LookupPetView | null>(null);
  const [petImageError, setPetImageError] = useState(false);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecordItem[]>([]);
  const [ownershipHistory, setOwnershipHistory] = useState<
    OwnershipHistoryItem[]
  >([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const searchedPetRef = useRef<LookupPetView | null>(null);
  const foregroundHistoryRequestRef = useRef<string | null>(null);
  const directoryScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  // Add Official Medical / Vaccination Modal (`addMedical` — Vaccination | Treatment only)
  const [isMedModalVisible, setIsMedModalVisible] = useState(false);
  const [recordType, setRecordType] = useState<'Vaccination' | 'Treatment'>(
    'Vaccination'
  );
  const [medicineType, setMedicineType] = useState<string>(DEFAULT_VACCINE_PRESET);
  const [medDescription, setMedDescription] = useState('');
  const [dateAdministered, setDateAdministered] = useState(() =>
    formatYmd(new Date())
  );
  const [expiryDate, setExpiryDate] = useState('');
  const [isSubmittingMed, setIsSubmittingMed] = useState(false);

  // Live Camera QR Scanner Modal State
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualScanToken, setManualScanToken] = useState('');
  const [hasScannedLock, setHasScannedLock] = useState(false);

  const mapVerifiedPetDoc = (doc: any): LookupPetView => {
    const verifStatus =
      doc.verificationStatus || (doc.isVerified ? 'verified' : 'draft');
    return {
      $id: doc.$id,
      petProfileId: doc.petProfileId || doc.$id,
      officialPetId: doc.$id,
      officialRegistryId:
        doc.officialRegistryId ||
        (verifStatus === 'verified'
          ? `CVO-${String(doc.$id).slice(0, 6).toUpperCase()}`
          : undefined),
      verificationStatus: verifStatus,
      ownerId: doc.ownerId,
      ownerName: doc.ownerName || 'Pet Owner',
      contact: doc.emergencyContact || '',
      displayAddress: doc.homeAddress || '',
      lostFoundMessage: doc.lostFoundMessage || '',
      petName: doc.petName || 'Companion',
      species: doc.species || 'Dog',
      breed: doc.breed || 'Aspin',
      sex: doc.sex || 'Male',
      ageYears: typeof doc.ageYears === 'number' ? doc.ageYears : 1,
      barangay: doc.barangay || 'Poblacion',
      vaccinationStatus:
        doc.vaccinationStatus ||
        (verifStatus === 'verified' ? 'Verified' : 'Unverified'),
      photoUrl: doc.imageUrl || getMediaFileUrl(doc.photoFileId),
    };
  };

  useEffect(() => {
    searchedPetRef.current = searchedPet;
  }, [searchedPet]);

  useEffect(() => {
    directoryScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [tokenInput]);

  useEffect(() => {
    setPetImageError(false);
  }, [searchedPet?.$id, searchedPet?.photoUrl]);

  const loadPetMedicalAndHistory = useCallback(
    async (petView: LookupPetView, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const targetPetId = petView.$id;

      // Never let a background/focus silent sync race an active foreground fetch
      if (silent && foregroundHistoryRequestRef.current) {
        return;
      }

      const requestKey = `${targetPetId}:${Date.now()}`;
      if (!silent) {
        foregroundHistoryRequestRef.current = requestKey;
        setIsHistoryLoading(true);
      }
      setHistoryError(null);

      const isStaleRequest = () => {
        if (!silent) {
          return foregroundHistoryRequestRef.current !== requestKey;
        }
        return (
          foregroundHistoryRequestRef.current !== null ||
          searchedPetRef.current?.$id !== targetPetId
        );
      };

      const candidateIds = Array.from(
        new Set(
          [petView.officialPetId, petView.petProfileId, petView.$id].filter(
            Boolean
          ) as string[]
        )
      );

      let medLoadFailed = false;

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
        const missing = medical
          .filter((item) => !item.recorderNameSnapshot && !item.recorderName)
          .map((item) => item.$id);
        if (missing.length) {
          try {
            const resolved = await operate<{
              recorders?: { recordId: string; recorderName: string }[];
            }>('resolveMedicalRecorders', { recordIds: missing.slice(0, 100) });
            const byId = new Map(
              (resolved.recorders || []).map((r) => [r.recordId, r.recorderName])
            );
            medical.forEach((item) => {
              if (!item.recorderNameSnapshot) {
                item.recorderName = byId.get(item.$id);
              }
            });
          } catch {
            /* Names remain snapshots or authorized fallback only */
          }
        }
        if (isStaleRequest()) return;
        setMedicalRecords(medical);
      } catch (err: any) {
        medLoadFailed = true;
        if (isStaleRequest()) return;
        if (!silent) {
          setMedicalRecords([]);
        }
        setHistoryError(
          err?.message || 'Unable to load official medical history from server.'
        );
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
        if (isStaleRequest()) return;
        setOwnershipHistory(
          histRes.documents as unknown as OwnershipHistoryItem[]
        );
      } catch (err: any) {
        if (isStaleRequest()) return;
        if (!silent) {
          setOwnershipHistory([]);
        }
        if (!medLoadFailed) {
          setHistoryError(
            err?.message || 'Unable to load ownership history from server.'
          );
        }
      } finally {
        if (!silent && foregroundHistoryRequestRef.current === requestKey) {
          foregroundHistoryRequestRef.current = null;
          setIsHistoryLoading(false);
        }
      }
    },
    []
  );

  const fetchVerifiedDirectory = useCallback(async (silent = false): Promise<LookupPetView[]> => {
    if (!silent) setIsRefreshing(true);
    try {
      // Server-safe staff directory is the same source used by the CVO Web panel.
      // It handles Appwrite row-level permissions and supplies short-lived photos.
      let rows: any[] = [];
      try {
        const remote = await operate<{ pets?: any[] }>('getStaffPetDirectory', {});
        rows = Array.isArray(remote?.pets) ? remote.pets : [];
      } catch (err) {
        console.warn('Staff directory Function unavailable; trying accessible registry rows:', err);
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, TABLES.PETS, [
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ]);
        rows = res.documents;
      }
      const mapped = rows.map(mapVerifiedPetDoc);
      setDirectoryPets(mapped);
      setDirectoryError(null);
      setHasLoadedDirectory(true);
      return mapped;
    } catch (error: any) {
      console.warn('Failed to load verified pets directory:', error);
      setDirectoryError(
        error?.message || 'Unable to reach CVO pet directory. Pull down or tap Retry.'
      );
      setHasLoadedDirectory(true);
      return [];
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVerifiedDirectory(false);
  }, [fetchVerifiedDirectory]);

  useFocusEffect(
    useCallback(() => {
      fetchVerifiedDirectory(true);
      if (searchedPetRef.current) {
        loadPetMedicalAndHistory(searchedPetRef.current, { silent: true });
      }
    }, [fetchVerifiedDirectory, loadPetMedicalAndHistory])
  );

  useLiveSync(
    () => {
      fetchVerifiedDirectory(true);
      if (searchedPetRef.current) {
        loadPetMedicalAndHistory(searchedPetRef.current, { silent: true });
      }
    },
    { enabled: !isMedModalVisible && !isScannerVisible }
  );

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

  const filteredDirectoryPets = useMemo(() => {
    const q = tokenInput.trim().toLowerCase();
    if (!q) return directoryPets;
    const ext = parseQrPayload(tokenInput).toLowerCase();
    return directoryPets.filter((p) => {
      return (
        p.$id.toLowerCase().includes(ext) ||
        p.petProfileId.toLowerCase().includes(ext) ||
        (p.officialRegistryId || '').toLowerCase().includes(q) ||
        (p.officialRegistryId || '').toLowerCase().includes(ext) ||
        p.petName.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.barangay.toLowerCase().includes(q) ||
        p.breed.toLowerCase().includes(q)
      );
    });
  }, [directoryPets, tokenInput]);

  const verifiedCount = useMemo(
    () => directoryPets.filter((p) => p.verificationStatus === 'verified').length,
    [directoryPets]
  );

  const handleSelectPet = async (pet: LookupPetView) => {
    Keyboard.dismiss();
    setMatchingCandidates([]);
    setSearchedPet(pet);
    setLookupNotFoundQuery(null);
    setMedicalRecords([]);
    setOwnershipHistory([]);
    await loadPetMedicalAndHistory(pet);
  };

  const findExactPetMatch = (
    list: LookupPetView[],
    rawLower: string,
    extractedLower: string
  ): LookupPetView | undefined =>
    list.find(
      (p) =>
        p.$id.toLowerCase() === extractedLower ||
        p.petProfileId.toLowerCase() === extractedLower ||
        (p.officialPetId || '').toLowerCase() === extractedLower ||
        (p.officialRegistryId || '').toLowerCase() === rawLower ||
        (p.officialRegistryId || '').toLowerCase() === extractedLower
    );

  const findTextMatches = (list: LookupPetView[], rawLower: string): LookupPetView[] =>
    list.filter(
      (p) =>
        p.petName.toLowerCase().includes(rawLower) ||
        p.ownerName.toLowerCase().includes(rawLower) ||
        (p.officialRegistryId || '').toLowerCase().includes(rawLower) ||
        p.breed.toLowerCase().includes(rawLower) ||
        p.barangay.toLowerCase().includes(rawLower)
    );

  const handleLookup = async (overrideInput?: string) => {
    Keyboard.dismiss();
    const rawQuery = (overrideInput ?? tokenInput).trim();
    if (!rawQuery) {
      Alert.alert(
        'Missing Input',
        'Scan a Pet QR code or enter a Pet ID, Official Registry ID, Pet Name, or Owner Name.'
      );
      return;
    }

    setIsLoading(true);
    setMatchingCandidates([]);
    const extractedId = parseQrPayload(rawQuery);
    const rawLower = rawQuery.toLowerCase();
    const extractedLower = extractedId.toLowerCase();

    try {
      // 1. Try cached directory first to avoid unnecessary full-directory reloads
      let allDirectory = directoryPets;
      let exactMatch = findExactPetMatch(allDirectory, rawLower, extractedLower);

      // Refresh from server if cache is empty or exact ID wasn't in local cache
      if (allDirectory.length === 0 || (!exactMatch && overrideInput !== undefined)) {
        const refreshed = await fetchVerifiedDirectory(true);
        if (refreshed.length > 0) {
          allDirectory = refreshed;
          exactMatch = findExactPetMatch(allDirectory, rawLower, extractedLower);
        }
      }

      if (exactMatch) {
        setSearchedPet(exactMatch);
        setLookupNotFoundQuery(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        await loadPetMedicalAndHistory(exactMatch);
        return;
      }

      // 2. Check text matches across local directory (refresh once if none found locally)
      let textMatches = findTextMatches(allDirectory, rawLower);
      if (textMatches.length === 0) {
        const refreshed = await fetchVerifiedDirectory(true);
        if (refreshed.length > 0) {
          allDirectory = refreshed;
          exactMatch = findExactPetMatch(allDirectory, rawLower, extractedLower);
          if (exactMatch) {
            setSearchedPet(exactMatch);
            setLookupNotFoundQuery(null);
            setMedicalRecords([]);
            setOwnershipHistory([]);
            await loadPetMedicalAndHistory(exactMatch);
            return;
          }
          textMatches = findTextMatches(allDirectory, rawLower);
        }
      }

      if (textMatches.length === 1) {
        setSearchedPet(textMatches[0]);
        setLookupNotFoundQuery(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        await loadPetMedicalAndHistory(textMatches[0]);
        return;
      }

      if (textMatches.length > 1) {
        setSearchedPet(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        setLookupNotFoundQuery(null);
        setMatchingCandidates(textMatches);
        return;
      }

      // 3. Fallback: Check public `pet_passports` for personal QR tokens
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

      if (passportDoc) {
        const publicView: LookupPetView = {
          $id: passportDoc.$id,
          petProfileId: passportDoc.$id,
          officialPetId: passportDoc.$id,
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
        setLookupNotFoundQuery(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        await loadPetMedicalAndHistory(publicView);
      } else {
        setSearchedPet(null);
        setMedicalRecords([]);
        setOwnershipHistory([]);
        setLookupNotFoundQuery(rawQuery);
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

  const openMedicalModal = () => {
    setRecordType('Vaccination');
    setMedicineType(DEFAULT_VACCINE_PRESET);
    setMedDescription('');
    setDateAdministered(formatYmd(new Date()));
    setExpiryDate('');
    setIsMedModalVisible(true);
  };

  const closeMedicalModal = () => {
    if (isSubmittingMed) return;
    setIsMedModalVisible(false);
  };

  const handleAddMedicalRecord = async () => {
    Keyboard.dismiss();
    if (!searchedPet) return;
    const targetPetId =
      searchedPet.officialPetId || searchedPet.petProfileId || searchedPet.$id;

    const cleanMed = medicineType.trim();
    const cleanDate = dateAdministered.trim();
    const cleanExpiry = expiryDate.trim();

    if (!cleanMed || !cleanDate) {
      Alert.alert(
        'Required Fields',
        'Please specify the vaccine/medicine name and date administered.'
      );
      return;
    }

    const parsedAdminDate = parseStrictYmd(cleanDate);
    if (!parsedAdminDate) {
      Alert.alert(
        'Invalid Date Administered',
        'Please enter a valid calendar date in YYYY-MM-DD format (e.g. 2026-11-12).'
      );
      return;
    }

    if (cleanExpiry) {
      const parsedExp = parseStrictYmd(cleanExpiry);
      if (!parsedExp) {
        Alert.alert(
          'Invalid Expiry Date',
          'Please enter a valid expiry date in YYYY-MM-DD format or leave it blank.'
        );
        return;
      }
      if (parsedExp.getTime() < parsedAdminDate.getTime()) {
        Alert.alert(
          'Expiry Date Too Early',
          'Expiry / booster date cannot be earlier than the date administered.'
        );
        return;
      }
    }

    setIsSubmittingMed(true);
    try {
      const isoDate = parsedAdminDate.toISOString();
      const baseDesc =
        medDescription.trim() ||
        `${recordType} recorded by Field Officer ${user?.fullName || ''}.`;
      const finalDescription = cleanExpiry
        ? `${baseDesc} [Exp: ${cleanExpiry}]`
        : baseDesc;

      const res = await operate<{ record?: any }>('addMedical', {
        petId: targetPetId,
        recordType,
        medicineType: cleanMed,
        description: finalDescription,
        dateAdministered: isoDate,
        expiryDate: cleanExpiry || undefined,
      });

      const optimisticRecord: MedicalRecordItem = {
        $id: res?.record?.$id || `local-${Date.now()}`,
        petId: targetPetId,
        veterinarianId: user?.id || '',
        recordType,
        medicineType: cleanMed,
        description: finalDescription,
        dateAdministered: isoDate,
        expiryDate: cleanExpiry || undefined,
        recorderNameSnapshot: user?.fullName || 'Field Officer',
      };

      setMedicalRecords((prev) => [
        optimisticRecord,
        ...prev.filter((r) => r.$id !== optimisticRecord.$id),
      ]);

      if (recordType === 'Vaccination') {
        const updatedPet: LookupPetView = {
          ...searchedPet,
          vaccinationStatus: '✓ Vaccination Recorded',
        };
        setSearchedPet(updatedPet);
        setDirectoryPets((prev) =>
          prev.map((p) => (p.$id === updatedPet.$id ? updatedPet : p))
        );
      }

      setIsMedModalVisible(false);
      setMedDescription('');
      setExpiryDate('');

      // Sync silently in the background without blocking UX
      loadPetMedicalAndHistory(searchedPet, { silent: true });
      fetchVerifiedDirectory(true);

      Alert.alert(
        'Saved successfully',
        `${recordType} (${cleanMed}) has been added to ${searchedPet.petName}'s official veterinary record.`
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
    Keyboard.dismiss();
    setTorchEnabled(false);
    setHasScannedLock(false);
    setManualScanToken('');
    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Needed',
          'You can still paste or enter a QR token manually in the scanner dialog.'
        );
      }
    }
    setIsScannerVisible(true);
  };

  const closeQrScanner = () => {
    Keyboard.dismiss();
    setIsScannerVisible(false);
    setTorchEnabled(false);
    setHasScannedLock(false);
    setManualScanToken('');
  };

  const officerArea = (user?.assignedArea || user?.barangay || '').trim();
  const isMedFormInvalid = !medicineType.trim() || !dateAdministered.trim();
  const hasOfficialVaccination = medicalRecords.some(
    (rec) => rec.recordType === 'Vaccination'
  );
  const hasOfficialTreatmentOnly =
    !hasOfficialVaccination && medicalRecords.length > 0;
  const petStatusLabel = hasOfficialVaccination
    ? '✓ Vaccination Recorded'
    : hasOfficialTreatmentOnly
    ? 'Treatment Logged (No Vaccine)'
    : searchedPet?.vaccinationStatus || 'No official record';
  const isPositiveVaccinationStatus =
    hasOfficialVaccination ||
    (!hasOfficialTreatmentOnly &&
      Boolean(searchedPet?.vaccinationStatus) &&
      !/no|unverified|none|not recorded/i.test(
        searchedPet?.vaccinationStatus || ''
      ));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Officer Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: semanticColors.headerBg,
            borderBottomColor: palette.border,
            borderBottomWidth: isDark ? 1 : 0,
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            CVO Field Registry & QR Lookup
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Officer: {user?.fullName || 'Field Officer'} • Area:{' '}
            {officerArea ? `Brgy. ${officerArea}` : 'Iligan City'}
          </Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              fetchVerifiedDirectory(false);
              if (searchedPet) {
                loadPetMedicalAndHistory(searchedPet, { silent: false });
              }
            }}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.instructionTitle}>
            Scan Collar QR or Search Registry
          </Text>
          <Text style={styles.instructionBody}>
            Look up companion animals by scanning their collar QR code or
            searching by Registry ID, pet name, or owner name.
          </Text>
        </View>

        {/* Unified Search & QR Bar */}
        <View style={styles.searchBox}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Official ID, Pet ID, Pet Name, or Owner..."
              placeholderTextColor={palette.secondary}
              value={tokenInput}
              onChangeText={(txt) => {
                setTokenInput(txt);
                setMatchingCandidates([]);
                if (!txt.trim()) {
                  setLookupNotFoundQuery(null);
                }
              }}
              onSubmitEditing={() => handleLookup()}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {tokenInput.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setTokenInput('');
                  setLookupNotFoundQuery(null);
                  setMatchingCandidates([]);
                  Keyboard.dismiss();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.qrScanTriggerBtn,
              {
                backgroundColor: palette.surfaceMuted,
                borderColor: palette.border,
              },
            ]}
            onPress={openQrScanner}
            accessibilityRole="button"
          >
            <Text style={[styles.qrScanTriggerText, { color: palette.text }]}>
              📷 Scan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: palette.primary }]}
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

        {/* Quick Municipal Pet Directory Chips (Live-filtered by tokenInput) */}
        <View style={styles.quickDirectorySection}>
          <View style={styles.quickSectionHeaderRow}>
            <Text style={styles.quickSectionLabel}>
              {tokenInput.trim()
                ? `Filtered Directory (${filteredDirectoryPets.length} of ${directoryPets.length}):`
                : `Municipal Pet Directory (${directoryPets.length} records):`}
            </Text>
            {directoryError && directoryPets.length > 0 ? (
              <TouchableOpacity onPress={() => fetchVerifiedDirectory(false)}>
                <Text style={[styles.retryInlineLink, { color: palette.primary }]}>
                  Sync failed • Retry
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!hasLoadedDirectory && isRefreshing ? (
            <View style={styles.inlineLoadingRow}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.emptyChipsText}>
                Loading municipal pet directory...
              </Text>
            </View>
          ) : directoryError && directoryPets.length === 0 ? (
            <View
              style={[
                styles.inlineErrorCard,
                {
                  backgroundColor: semanticColors.dangerBg,
                  borderColor: semanticColors.dangerBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.inlineErrorText,
                  { color: semanticColors.dangerText },
                ]}
              >
                {directoryError}
              </Text>
              <TouchableOpacity
                style={[styles.retryPillBtn, { backgroundColor: palette.primary }]}
                onPress={() => fetchVerifiedDirectory(false)}
              >
                <Text style={styles.retryPillBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : filteredDirectoryPets.length === 0 ? (
            <Text style={styles.emptyChipsText}>
              {tokenInput.trim()
                ? `No cached directory matches for "${tokenInput.trim()}". Tap Lookup to search full registry.`
                : 'No municipal pets found yet.'}
            </Text>
          ) : (
            <ScrollView
              ref={directoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredDirectoryPets.map((pet) => {
                const isSelected = searchedPet?.$id === pet.$id;
                return (
                  <TouchableOpacity
                    key={pet.$id}
                    style={[
                      styles.petChip,
                      isSelected && {
                        backgroundColor: palette.primaryMuted,
                        borderColor: palette.primary,
                      },
                    ]}
                    onPress={() => handleSelectPet(pet)}
                  >
                    <Text
                      style={[
                        styles.petChipName,
                        isSelected && { color: palette.primary },
                      ]}
                    >
                      {pet.species === 'Cat' ? '🐱' : '🐶'} {pet.petName}
                    </Text>
                    <Text
                      style={[
                        styles.petChipToken,
                        isSelected && { color: palette.primary },
                      ]}
                    >
                      {pet.officialRegistryId || pet.$id.slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Multi-Match Picker Card (when text query matches >1 pet) */}
        {matchingCandidates.length > 0 && !searchedPet && (
          <View style={styles.candidateListCard}>
            <View style={styles.candidateHeaderRow}>
              <Text style={styles.candidateTitle}>
                Multiple Matching Pets Found ({matchingCandidates.length})
              </Text>
              <TouchableOpacity onPress={() => setMatchingCandidates([])}>
                <Text style={[styles.retryInlineLink, { color: palette.primary }]}>
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.candidateSub}>
              Select the companion animal you want to inspect or update:
            </Text>
            {matchingCandidates.map((pet) => {
              const isVerif = pet.verificationStatus === 'verified';
              return (
                <TouchableOpacity
                  key={pet.$id}
                  style={styles.candidateRow}
                  onPress={() => handleSelectPet(pet)}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.candidateName}>
                      {pet.species === 'Cat' ? '🐱' : '🐶'} {pet.petName}
                    </Text>
                    <Text style={styles.candidateMeta}>
                      Owner: {pet.ownerName} • {pet.breed} • Brgy. {pet.barangay}
                    </Text>
                    <Text style={[styles.candidateId, { color: palette.primary }]}>
                      {pet.officialRegistryId || pet.petProfileId}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isVerif
                          ? semanticColors.successBg
                          : semanticColors.warningBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: isVerif
                            ? semanticColors.successText
                            : semanticColors.warningText,
                        },
                      ]}
                    >
                      {isVerif ? '✓ Verified' : 'Unverified'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Initial Ready-State Card (replaces blank whitespace before lookup) */}
        {!searchedPet && !lookupNotFoundQuery && matchingCandidates.length === 0 && (
          <View style={styles.readyStateCard}>
            <Text style={styles.readyStateIcon}>🐾</Text>
            <Text style={styles.readyStateTitle}>Ready for Field Inspection</Text>
            <Text style={styles.readyStateSub}>
              {hasLoadedDirectory
                ? `${directoryPets.length} municipal records loaded (${verifiedCount} CVO verified). Tap any pet chip above, search by ID or name, or scan a collar QR tag.`
                : 'Connecting to CVO municipal pet directory...'}
            </Text>
            <View style={styles.readyStateBtnRow}>
              <TouchableOpacity
                style={[styles.readyActionPrimary, { backgroundColor: palette.primary }]}
                onPress={openQrScanner}
              >
                <Text style={styles.readyActionPrimaryText}>📷 Scan Collar QR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.readyActionSecondary,
                  { borderColor: palette.border, backgroundColor: palette.surfaceMuted },
                ]}
                onPress={() => fetchVerifiedDirectory(false)}
                disabled={isRefreshing}
              >
                <Text style={[styles.readyActionSecondaryText, { color: palette.text }]}>
                  {isRefreshing ? 'Refreshing...' : '↻ Refresh Directory'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* No Result Inline Empty State */}
        {lookupNotFoundQuery && !searchedPet && (
          <View style={styles.noResultCard}>
            <Text style={styles.noResultIcon}>🔍</Text>
            <Text style={styles.noResultTitle}>No Matching Pet Found</Text>
            <Text style={styles.noResultSub}>
              No public QR passport or CVO pet matched "{lookupNotFoundQuery}".
              Try searching by owner name, pet name, or tapping a pet from the directory above.
            </Text>
            <TouchableOpacity
              style={[styles.noResultActionBtn, { backgroundColor: palette.primary }]}
              onPress={() => {
                setTokenInput('');
                setLookupNotFoundQuery(null);
              }}
            >
              <Text style={styles.noResultActionBtnText}>Clear Search</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lookup Result Card */}
        {searchedPet && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.resultHeaderTopRow}>
                {searchedPet.photoUrl && !petImageError ? (
                  <Image
                    source={{ uri: searchedPet.photoUrl }}
                    style={styles.petAvatar}
                    onError={() => setPetImageError(true)}
                  />
                ) : (
                  <View style={styles.petAvatarPlaceholder}>
                    <Text style={{ fontSize: 32 }}>
                      {searchedPet.species === 'Cat' ? '🐱' : '🐶'}
                    </Text>
                  </View>
                )}
                <View style={styles.resultTitleCol}>
                  <View style={styles.resultNameBadgeRow}>
                    <Text style={styles.petName} numberOfLines={2}>
                      {searchedPet.petName}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            searchedPet.verificationStatus === 'verified'
                              ? semanticColors.successBg
                              : semanticColors.warningBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              searchedPet.verificationStatus === 'verified'
                                ? semanticColors.successText
                                : semanticColors.warningText,
                          },
                        ]}
                      >
                        {searchedPet.verificationStatus === 'verified'
                          ? '✓ CVO Verified'
                          : searchedPet.verificationStatus === 'pending'
                          ? '⏳ Pending CVO'
                          : 'Personal QR Only'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.petMetaSub}>
                    {searchedPet.breed} • {searchedPet.species} •{' '}
                    {searchedPet.sex} • {searchedPet.ageYears} yr(s)
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.petIdStrip,
                  {
                    backgroundColor: palette.primaryMuted,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={[styles.petIdStripLabel, { color: palette.secondary }]}>
                  {searchedPet.officialRegistryId ? 'Official ID' : 'QR ID'}
                </Text>
                <Text
                  style={[styles.petIdStripValue, { color: palette.primary }]}
                  selectable
                >
                  {searchedPet.officialRegistryId || searchedPet.petProfileId}
                </Text>
              </View>
            </View>

            {searchedPet.verificationStatus !== 'verified' && (
              <View
                style={[
                  styles.unverifiedBanner,
                  {
                    backgroundColor: semanticColors.warningBg,
                    borderColor: semanticColors.warningBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.unverifiedBannerText,
                    { color: semanticColors.warningText },
                  ]}
                >
                  Note: This companion animal is not yet officially CVO verified.
                  Field medical entries recorded here will link to its profile.
                </Text>
              </View>
            )}

            <View style={styles.dataSection}>
              <View style={styles.dataGridContainer}>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Owner:</Text>
                  <Text style={styles.dataValue}>{searchedPet.ownerName}</Text>
                </View>
                {searchedPet.contact ? (
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Emergency Contact:</Text>
                    <View style={styles.contactActionWrap}>
                      <Text style={styles.contactValueText}>
                        {searchedPet.contact}
                      </Text>
                      <CallButton phone={searchedPet.contact} />
                    </View>
                  </View>
                ) : null}
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Barangay:</Text>
                  <Text style={styles.dataValue}>
                    Brgy. {searchedPet.barangay}, Iligan City
                  </Text>
                </View>
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Vaccination Status:</Text>
                  <Text
                    style={[
                      styles.dataValueHighlight,
                      {
                        color: isPositiveVaccinationStatus
                          ? semanticColors.successText
                          : hasOfficialTreatmentOnly
                          ? semanticColors.warningText
                          : palette.secondary,
                      },
                    ]}
                  >
                    {petStatusLabel}
                  </Text>
                </View>
              </View>
            </View>

            {/* Officer Action Bar: Log Official Vaccination / Treatment */}
            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[styles.logMedicalBtn, { backgroundColor: palette.primary }]}
                onPress={openMedicalModal}
              >
                <Text style={styles.logMedicalBtnText} numberOfLines={1}>
                  💉 + Record Vaccination / Treatment
                </Text>
              </TouchableOpacity>
            </View>

            {/* Official Medical & Vaccination History */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>
                Official Clinical & Vaccination History ({medicalRecords.length})
              </Text>

              {historyError ? (
                <View
                  style={[
                    styles.inlineErrorCard,
                    {
                      backgroundColor: semanticColors.dangerBg,
                      borderColor: semanticColors.dangerBorder,
                      marginBottom: 10,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.inlineErrorText,
                      { color: semanticColors.dangerText },
                    ]}
                  >
                    {historyError}
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryPillBtn, { backgroundColor: palette.primary }]}
                    onPress={() => loadPetMedicalAndHistory(searchedPet)}
                  >
                    <Text style={styles.retryPillBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {isHistoryLoading && medicalRecords.length === 0 ? (
                <View style={styles.historyStateCard}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.historyStateText}>
                    Checking official veterinary records...
                  </Text>
                </View>
              ) : medicalRecords.length === 0 ? (
                <View style={styles.historyEmptyCard}>
                  <Text style={styles.historyEmptyIcon}>🩺</Text>
                  <Text style={styles.historyEmptyTitle}>
                    No Veterinary Records Yet
                  </Text>
                  <Text style={styles.historyEmptySub}>
                    No CVO vaccinations or treatments have been logged for{' '}
                    {searchedPet.petName} yet.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.historyEmptyBtn,
                      {
                        borderColor: palette.primary,
                        backgroundColor: palette.primaryMuted,
                      },
                    ]}
                    onPress={openMedicalModal}
                  >
                    <Text
                      style={[
                        styles.historyEmptyBtnText,
                        { color: palette.primary },
                      ]}
                    >
                      + Log First Record
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                medicalRecords.map((rec) => {
                  const isVax = rec.recordType === 'Vaccination';
                  const { expiryStr, cleanDescription, status } =
                    extractRecordExpiry(rec);
                  const expiryColors =
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
                          bg: palette.primaryMuted,
                          text: palette.primary,
                          label: `Expires: ${expiryStr}`,
                        };

                  return (
                    <View
                      key={rec.$id}
                      style={[
                        styles.recordCard,
                        {
                          borderLeftColor: isVax
                            ? semanticColors.successText
                            : palette.primary,
                        },
                      ]}
                    >
                      <View style={styles.recordHeaderRow}>
                        <View
                          style={[
                            styles.recordTypeBadgeWrap,
                            {
                              backgroundColor: isVax
                                ? semanticColors.successBg
                                : palette.primaryMuted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.recordTypeBadgeText,
                              {
                                color: isVax
                                  ? semanticColors.successText
                                  : palette.primary,
                              },
                            ]}
                          >
                            {isVax ? '💉 Vaccination' : '🩺 Treatment'}
                          </Text>
                        </View>
                        <Text style={styles.recordDate}>
                          {new Date(rec.dateAdministered).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={styles.recordMedName}>{rec.medicineType}</Text>
                      {cleanDescription ? (
                        <Text style={styles.recordDesc}>{cleanDescription}</Text>
                      ) : null}
                      {expiryStr ? (
                        <View
                          style={[
                            styles.expiryChip,
                            { backgroundColor: expiryColors.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.expiryChipText,
                              { color: expiryColors.text },
                            ]}
                          >
                            📅 {expiryColors.label}
                          </Text>
                        </View>
                      ) : null}
                      {rec.recorderNameSnapshot || rec.recorderName ? (
                        <Text style={[styles.recordDate, { marginTop: 6 }]}>
                          Officer: {rec.recorderNameSnapshot || rec.recorderName}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>

            {/* Ownership History */}
            {ownershipHistory.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>
                  Ownership History ({ownershipHistory.length})
                </Text>
                {ownershipHistory.map((h) => (
                  <View
                    key={h.$id}
                    style={[
                      styles.recordCard,
                      { borderLeftColor: palette.primary },
                    ]}
                  >
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
        onRequestClose={closeQrScanner}
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
              <Text style={[styles.modalTitle, { marginBottom: 0, flex: 1 }]}>
                Scan Pet Passport QR
              </Text>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity
                  style={styles.torchBtn}
                  onPress={() => setTorchEnabled(!torchEnabled)}
                >
                  <Text style={styles.torchBtnText}>
                    {torchEnabled ? '🔦 ON' : '🔦 OFF'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={closeQrScanner}
                  accessibilityLabel="Close QR scanner"
                >
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {cameraPermission?.granted ? (
              <View
                style={[styles.cameraContainer, { borderColor: palette.primary }]}
              >
                <CameraView
                  style={{ flex: 1 }}
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(result) => {
                    if (hasScannedLock || !result?.data) return;
                    setHasScannedLock(true);
                    const scannedData = result.data;
                    closeQrScanner();
                    const extracted = parseQrPayload(scannedData);
                    setTokenInput(extracted);
                    handleLookup(scannedData);
                  }}
                />
                <View style={styles.scannerReticleWrap} pointerEvents="none">
                  <View style={styles.scannerReticleBox} />
                  <Text style={styles.scannerReticleText}>
                    Align pet collar QR inside frame
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.cameraFrame}>
                <Text style={styles.cameraFrameText}>
                  Camera permission not granted. You can grant access or paste the QR / Pet ID below.
                </Text>
                <TouchableOpacity
                  style={[styles.requestPermBtn, { backgroundColor: palette.primary }]}
                  onPress={requestCameraPermission}
                >
                  <Text style={styles.requestPermBtnText}>
                    Grant Camera Access
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.fieldLabel}>
              Or Paste QR URL / Pet Profile ID / Official Registry ID
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="passport.html?pet=... or Official ID"
              placeholderTextColor={palette.secondary}
              value={manualScanToken}
              onChangeText={setManualScanToken}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => {
                const token = manualScanToken.trim();
                if (!token) return;
                closeQrScanner();
                setTokenInput(token);
                handleLookup(token);
              }}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeQrScanner}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: palette.primary },
                  !manualScanToken.trim() && styles.disabledBtn,
                ]}
                disabled={!manualScanToken.trim()}
                onPress={() => {
                  const token = manualScanToken.trim();
                  if (!token) return;
                  closeQrScanner();
                  setTokenInput(token);
                  handleLookup(token);
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
        onRequestClose={closeMedicalModal}
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
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: Math.max(16, insets.bottom + 8),
              }}
            >
              <View style={styles.scannerHeaderRow}>
                <Text style={[styles.modalTitle, { marginBottom: 0, flex: 1 }]}>
                  Record Official Vaccination / Treatment
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={closeMedicalModal}
                  disabled={isSubmittingMed}
                  accessibilityLabel="Close medical entry modal"
                >
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.patientBanner,
                  {
                    backgroundColor: palette.primaryMuted,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={styles.patientBannerIcon}>🐾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.patientBannerName, { color: palette.primary }]}>
                    {searchedPet?.petName}
                  </Text>
                  <Text style={[styles.patientBannerMeta, { color: palette.text }]}>
                    {searchedPet?.officialRegistryId
                      ? `Official Registry ID: ${searchedPet.officialRegistryId}`
                      : `Pet ID: ${searchedPet?.$id}`}
                    {' • '}Brgy. {searchedPet?.barangay}
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Record Type</Text>
              <View style={styles.typeWrap}>
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
                            ? DEFAULT_VACCINE_PRESET
                            : DEFAULT_TREATMENT_PRESET
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          recordType === type && [
                            styles.typePillTextActive,
                            { color: palette.primary },
                          ],
                        ]}
                      >
                        {type === 'Vaccination'
                          ? '💉 Vaccination'
                          : '🩺 Treatment'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={styles.fieldLabel}>Vaccine / Medicine Type *</Text>
              <TextInput
                style={styles.modalInput}
                value={medicineType}
                onChangeText={setMedicineType}
                placeholder="Select a preset below or type custom vaccine/treatment..."
                placeholderTextColor={palette.secondary}
                maxLength={100}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ marginTop: 4, marginBottom: 8 }}
              >
                {VACCINE_TREATMENT_PRESETS.map((preset) => {
                  const isActivePreset = medicineType === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.petChip,
                        styles.presetChip,
                        isActivePreset && {
                          backgroundColor: palette.primaryMuted,
                          borderColor: palette.primary,
                        },
                      ]}
                      onPress={() => {
                        setMedicineType(preset);
                        if (
                          /vaccine/i.test(preset) &&
                          recordType !== 'Vaccination'
                        ) {
                          setRecordType('Vaccination');
                        } else if (
                          !/vaccine/i.test(preset) &&
                          recordType !== 'Treatment'
                        ) {
                          setRecordType('Treatment');
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.petChipName,
                          isActivePreset && { color: palette.primary },
                          { fontSize: 11 },
                        ]}
                      >
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>
                Date Administered (YYYY-MM-DD) *
              </Text>
              <TextInput
                style={styles.modalInput}
                value={dateAdministered}
                onChangeText={setDateAdministered}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.secondary}
                maxLength={10}
              />
              <View style={styles.quickDateRow}>
                <TouchableOpacity
                  style={[
                    styles.quickDateChip,
                    { backgroundColor: palette.surfaceMuted, borderColor: palette.border },
                  ]}
                  onPress={() => setDateAdministered(formatYmd(new Date()))}
                >
                  <Text style={[styles.quickDateChipText, { color: palette.text }]}>
                    Today
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>
                Expiry / Booster Due Date (YYYY-MM-DD, Optional)
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 2027-11-12 (leave blank if N/A)"
                placeholderTextColor={palette.secondary}
                value={expiryDate}
                onChangeText={setExpiryDate}
                maxLength={10}
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
                        backgroundColor: palette.surfaceMuted,
                        borderColor: palette.border,
                      },
                    ]}
                    onPress={() =>
                      setExpiryDate(addMonthsYmd(dateAdministered, opt.months))
                    }
                  >
                    <Text style={[styles.quickDateChipText, { color: palette.primary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {expiryDate.trim().length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      {
                        backgroundColor: semanticColors.dangerBg,
                        borderColor: semanticColors.dangerBorder,
                      },
                    ]}
                    onPress={() => setExpiryDate('')}
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

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>
                  Clinical Notes / Batch Number
                </Text>
                <Text style={styles.charCounter}>
                  {medDescription.length}/1000
                </Text>
              </View>
              <TextInput
                style={[
                  styles.modalInput,
                  { height: 76, textAlignVertical: 'top' },
                ]}
                placeholder="Enter batch number, dosage, or clinical notes..."
                placeholderTextColor={palette.secondary}
                value={medDescription}
                onChangeText={setMedDescription}
                maxLength={1000}
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
                  onPress={closeMedicalModal}
                  disabled={isSubmittingMed}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: palette.primary },
                    (isSubmittingMed || isMedFormInvalid) && styles.disabledBtn,
                  ]}
                  onPress={handleAddMedicalRecord}
                  disabled={isSubmittingMed || isMedFormInvalid}
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
    backgroundColor: '#162337',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  titleRow: {
    marginBottom: 14,
  },
  instructionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  instructionBody: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  qrScanTriggerBtn: {
    backgroundColor: '#EAF1FB',
    borderWidth: 1,
    borderColor: '#DEE5EF',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrScanTriggerText: { color: '#1E293B', fontSize: 12, fontWeight: 'bold' },
  searchBtn: {
    backgroundColor: '#3478F6',
    height: 46,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  searchBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  disabledBtn: { opacity: 0.5 },
  quickDirectorySection: { marginBottom: 18 },
  quickSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  quickSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  retryInlineLink: {
    fontSize: 11,
    fontWeight: '700',
  },
  inlineLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  emptyChipsText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  inlineErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  retryPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryPillBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  petChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 44,
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  presetChip: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  petChipName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  petChipToken: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  candidateListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  candidateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  candidateTitle: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  candidateSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  candidateName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  candidateMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  candidateId: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  readyStateCard: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  readyStateIcon: { fontSize: 32, marginBottom: 8 },
  readyStateTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  readyStateSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  readyStateBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  readyActionPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  readyActionPrimaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  readyActionSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  readyActionSecondaryText: { fontSize: 12, fontWeight: '700' },
  noResultCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    marginBottom: 16,
  },
  noResultIcon: { fontSize: 32, marginBottom: 8 },
  noResultTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  noResultSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  noResultActionBtn: {
    marginTop: 14,
    backgroundColor: '#3478F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  noResultActionBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  resultHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  resultHeaderTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  resultTitleCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  resultNameBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  petAvatar: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  petAvatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  petName: { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
  petMetaSub: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  petIdStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  petIdStripLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  petIdStripValue: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dataSection: { paddingVertical: 4 },
  dataGridContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 0,
  },
  dataValue: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
    textAlign: 'right',
    marginLeft: 12,
  },
  contactActionWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginLeft: 12,
  },
  contactValueText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
    textAlign: 'right',
  },
  dataValueHighlight: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginLeft: 12,
  },
  actionContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  logMedicalBtn: {
    backgroundColor: '#3478F6',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMedicalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  unverifiedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  unverifiedBannerText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
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
  historyStateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  historyStateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  historyEmptyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  historyEmptyIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  historyEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  historyEmptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  historyEmptyBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  historyEmptyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  recordCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#3478F6',
  },
  recordHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recordTypeBadgeWrap: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recordTypeBadgeText: { fontSize: 11, fontWeight: 'bold' },
  recordDate: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  recordMedName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  recordDesc: { fontSize: 12, color: '#475569', marginTop: 2, lineHeight: 17 },
  expiryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  expiryChipText: { fontSize: 11, fontWeight: '700' },
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
    marginBottom: 12,
    gap: 8,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  torchBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
  },
  torchBtnText: { fontSize: 12, fontWeight: 'bold', color: '#1E293B' },
  modalCloseBtn: {
    backgroundColor: '#F1F5F9',
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 15, fontWeight: 'bold', color: '#475569' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 12 },
  cameraContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#3478F6',
    position: 'relative',
  },
  scannerReticleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerReticleBox: {
    width: 140,
    height: 140,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  scannerReticleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 3,
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
  cameraFrameText: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  requestPermBtn: {
    backgroundColor: '#3478F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  requestPermBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  patientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 10,
  },
  patientBannerIcon: { fontSize: 22 },
  patientBannerName: { fontSize: 14, fontWeight: 'bold' },
  patientBannerMeta: { fontSize: 11, marginTop: 1 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCounter: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  typeWrap: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  typeRow: { flexDirection: 'row', gap: 4 },
  typePill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  typePillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  typePillText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  typePillTextActive: { fontWeight: 'bold' },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 8,
  },
  quickDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  quickDateChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: '#3478F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});