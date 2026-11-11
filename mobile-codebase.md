This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching these patterns are excluded: package-lock.json, node_modules/**, assets/**, .expo/**, *.png, *.jpg
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  api/
    adoption.ts
    auth.ts
    client.ts
    disease.ts
    phase422.ts
  components/
    BreedPicker.tsx
    CallButton.tsx
    FullscreenMap.tsx
    README.md
  navigation/
    AppNavigator.tsx
    OfficerTabNavigator.tsx
    TabNavigator.tsx
    types.ts
  screens/
    Adoption/
      AdoptionFeed.tsx
      AdoptionMatchesPanel.tsx
      PetDetailScreen.tsx
    Auth/
      LoginScreen.tsx
      RegisterScreen.tsx
    Community/
      CommunityScreen.tsx
    Officer/
      FieldIncidentScreen.tsx
      FieldLookupScreen.tsx
      OcularQueueScreen.tsx
    Profile/
      OwnedPetPassportScreen.tsx
      SettingsScreen.tsx
      UserProfileScreen.tsx
    Surveillance/
      DiseaseMap.tsx
  store/
    types/
      adoption.ts
      auth.ts
      constants.ts
      pets.ts
      surveillance.ts
    index.ts
  utils/
    constants.ts
  theme.ts
tests/
  verify_phase422.cjs
  verify_source.cjs
.env.example
app.json
App.tsx
package.json
README_PHASE422_MOBILE_UPDATE.md
README_PHASE5_MOBILE_REPAIR.md
tsconfig.json
```

# Files

## File: src/api/adoption.ts
```typescript
import { Query } from 'react-native-appwrite';
import {
  databases,
  account,
  operate,
  getMediaFileUrl,
  APPWRITE_DATABASE_ID,
  TABLES,
} from './client';
import { AdoptionApplication } from '../store/types/adoption';
import { AdoptionListing, VaccinationRecord } from '../store/types/pets';
import { normalizeBarangay } from '../store/types/constants';

export const adoptionApi = {
  /**
   * Fetches active/available adoption listings from `adoption_listings`
   * and enriches them with consented photos and medical records.
   */
  getAvailablePets: async (): Promise<AdoptionListing[]> => {
    const response = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      TABLES.ADOPTION_LISTINGS,
      [Query.orderDesc('$createdAt'), Query.limit(100)]
    );

    const visibleDocs = response.documents.filter(
      (doc: any) =>
        doc.isActive !== false &&
        String(doc.status || 'available').toLowerCase() !== 'adopted'
    );

    const listings = await Promise.all(
      visibleDocs.map(async (doc: any): Promise<AdoptionListing> => {
        let petDoc: any = null;
        let vaccinations: VaccinationRecord[] = [];
        const lookupPetId = String(doc.petId || doc.petProfileId || '');

        if (lookupPetId) {
          try {
            petDoc = await databases.getDocument(
              APPWRITE_DATABASE_ID,
              TABLES.PET_PASSPORTS,
              lookupPetId
            );
          } catch {
            try {
              petDoc = await databases.getDocument(
                APPWRITE_DATABASE_ID,
                TABLES.PETS,
                lookupPetId
              );
            } catch {
              petDoc = null;
            }
          }

          try {
            const medRes = await databases.listDocuments(
              APPWRITE_DATABASE_ID,
              TABLES.MEDICAL_RECORDS,
              [Query.equal('petId', lookupPetId), Query.limit(20)]
            );
            vaccinations = medRes.documents.map((m: any) => ({
              id: m.$id,
              vaccine_name: m.medicineType || m.recordType || 'Vaccination',
              administered_date: m.dateAdministered || 'Recorded',
              expiration_date: 'CVO Official Record',
              administered_by: m.veterinarianId || 'CVO Field Officer',
              notes: m.description,
            }));
          } catch {
            vaccinations = [];
          }
        }

        const rawSpecies = String(
          doc.species || petDoc?.species || 'Dog'
        ).toUpperCase();
        const normalizedSpecies =
          rawSpecies === 'CAT' ? 'CAT' : rawSpecies === 'DOG' ? 'DOG' : 'OTHER';

        const rawSex = String(doc.sex || petDoc?.sex || 'Male').toUpperCase();
        const normalizedGender =
          rawSex === 'FEMALE' || rawSex === 'F' ? 'FEMALE' : 'MALE';

        const housingReq = String(doc.housingRequirement || 'any').toLowerCase();
        const housingLabel =
          housingReq === 'apartment'
            ? 'Apartment Friendly'
            : housingReq === 'house'
            ? 'House Required'
            : housingReq === 'yard'
            ? 'Fenced Yard Required'
            : 'Any Suitable Home';

        const petPhotoUrl =
          getMediaFileUrl(doc.photoFileId || petDoc?.photoFileId) ||
          (normalizedSpecies === 'CAT'
            ? 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80'
            : 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80');

        const ownerAvatarUrl = getMediaFileUrl(doc.ownerAvatarFileId);
        const verifStatus =
          doc.verificationStatus || petDoc?.verificationStatus || 'draft';

        return {
          id: doc.$id,
          listingId: doc.$id,
          petId: String(doc.petId || lookupPetId || doc.$id),
          petProfileId: String(doc.petProfileId || doc.petId || doc.$id),
          postedById: String(doc.postedById || ''),
          ownerDisplayName: doc.ownerDisplayName || 'Pet Owner',
          ownerAvatarUrl,
          verificationStatus: verifStatus,
          title: doc.title || petDoc?.petName || 'Companion for Adoption',
          requirements:
            doc.requirements ||
            'Loving home in Iligan City • Responsible Pet Ownership',
          housingRequirement: housingReq,
          temperament: [
            housingLabel,
            verifStatus === 'verified' ? '✓ CVO Verified Pet' : 'Owner Listed',
          ],
          adoption_reason:
            doc.description ||
            'Listed by owner on CityVetHub peer-to-peer adoption feed.',
          adoption_fee: 'Free / Direct Owner Handover',
          isActive: doc.isActive !== false,
          status: String(doc.status || 'available').toUpperCase(),
          registered_pet: {
            id: String(doc.petId || doc.$id),
            petProfileId: String(doc.petProfileId || doc.petId || doc.$id),
            owner_id: String(doc.postedById || ''),
            name: petDoc?.petName || doc.title || 'Companion',
            registration_number:
              petDoc?.officialRegistryId ||
              `QR-${String(doc.petProfileId || doc.petId || doc.$id)
                .slice(0, 8)
                .toUpperCase()}`,
            officialRegistryId: petDoc?.officialRegistryId,
            verificationStatus: verifStatus,
            species: normalizedSpecies,
            breed: doc.breed || petDoc?.breed || 'Aspin',
            gender: normalizedGender,
            ageYears:
              typeof doc.ageYears === 'number' ? doc.ageYears : typeof petDoc?.ageYears === 'number' ? petDoc.ageYears : 1,
            barangay: normalizeBarangay(doc.barangay || petDoc?.barangay),
            photo: petPhotoUrl,
            photoFileId: doc.photoFileId || petDoc?.photoFileId,
            is_neutered: true,
            vaccinations,
          },
        };
      })
    );

    return listings;
  },

  /**
   * Submits an adoption application via `cityvethub-operations` Function.
   * Contract Section 07: { action: 'applyAdoption', listingId, contactNumber, message }
   */
  submitApplication: async (
    applicationData: Partial<AdoptionApplication>
  ): Promise<AdoptionApplication> => {
    const listingId = String(
      applicationData.listingId || applicationData.pet || ''
    ).trim();
    if (!listingId) {
      throw new Error('Listing ID is required to apply for adoption.');
    }

    const contactNumber = String(
      applicationData.contactNumber || applicationData.contact_number || ''
    ).trim();
    if (contactNumber.length < 7 || contactNumber.length > 40) {
      throw new Error(
        'Please provide a valid contact number (7 to 40 characters).'
      );
    }

    const message = String(
      applicationData.message || applicationData.reason_for_adoption || ''
    ).trim();
    if (!message) {
      throw new Error('Please enter your reason for adopting this pet.');
    }

    const res = await operate<any>('applyAdoption', {
      listingId,
      contactNumber,
      message,
    });

    return {
      id: res?.$id || res?.id || Date.now().toString(),
      listingId,
      pet: applicationData.pet || listingId,
      contact_number: contactNumber,
      contactNumber,
      address: applicationData.address || 'Iligan City',
      reason_for_adoption: message,
      message,
      has_other_pets: Boolean(applicationData.has_other_pets),
      status: 'PENDING',
      applied_at: new Date().toISOString(),
    };
  },

  /**
   * Retrieves the logged-in user's submitted applications from `adoption_applications`
   */
  getMyApplications: async (): Promise<AdoptionApplication[]> => {
    const currentUser = await account.get();
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      TABLES.ADOPTION_APPLICATIONS,
      [
        Query.equal('applicantId', currentUser.$id),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]
    );

    return res.documents.map((doc: any) => ({
      id: doc.$id,
      listingId: doc.listingId,
      pet: doc.petId || doc.listingId,
      applicant: doc.applicantId,
      applicantId: doc.applicantId,
      applicantName: doc.applicantName,
      petName: doc.petNameSnapshot || doc.petName || '',
      listingTitle: doc.listingTitleSnapshot || doc.listingTitle || '',
      message: doc.message,
      contact_number: doc.contactNumber || '',
      contactNumber: doc.contactNumber || '',
      address: 'Iligan City',
      reason_for_adoption: doc.message || '',
      has_other_pets: false,
      status: String(doc.status || 'PENDING').toUpperCase() as any,
      applied_at: doc.submittedAt || doc.$createdAt,
    }));
  },
};
```

## File: src/api/auth.ts
```typescript
import { ID, Query } from 'react-native-appwrite';
import {
  account,
  databases,
  teams,
  operate,
  uploadMediaFile,
  getMediaFileUrl,
  getOwnedImageUri,
  APPWRITE_DATABASE_ID,
  TEAM_ADMINS,
  TEAM_FIELD_OFFICERS,
  TABLES,
} from './client';
import {
  CitizenProfile,
  IdCategoryRow,
  OwnerVerificationRequestRow,
  Role,
  UserProfileRow,
  VerificationStatus,
} from '../store/types/auth';
import { normalizeBarangay } from '../store/types/constants';

export const authApi = {
  /**
   * Pings the `cityvethub-operations` Function to verify deployment status (expected build 4.15.0)
   */
  pingBackend: async (): Promise<{ build?: string; status?: string }> => {
    return operate('ping', {});
  },

  /**
   * Resolves the current logged-in Appwrite user, Teams membership, and `user_profiles` row.
   */
  resolveCurrentUser: async (): Promise<CitizenProfile> => {
    const appwriteUser = await account.get();
    const prefs = (appwriteUser.prefs || {}) as Record<string, any>;

    // 1. Check Teams membership
    let isFieldOfficer = false;
    let isAdmin = false;
    try {
      const teamList = await teams.list();
      isAdmin = teamList.teams.some((t) => t.$id === TEAM_ADMINS);
      isFieldOfficer = teamList.teams.some(
        (t) => t.$id === TEAM_FIELD_OFFICERS
      );
    } catch {
      // Standard Pet Owners without team list access remain non-staff
    }

    // Contract Section 01 & 04: CVO Administrator is WEB-ONLY.
    if (isAdmin && !isFieldOfficer) {
      await account.deleteSession('current').catch(() => {});
      throw new Error(
        'CVO Administrator accounts are restricted to the Web Administration Panel. Please sign in with a Pet Owner or Field Officer account.'
      );
    }

    let contractRole: Role = 'owner';
    if (isFieldOfficer) {
      contractRole = 'officer';
    } else if (prefs.requestedRole === 'officer') {
      contractRole = 'pending_officer';
    }

    // 2. Fetch private `user_profiles` row ($id == Auth user.$id)
    let profileDoc: Partial<UserProfileRow> | null = null;
    try {
      profileDoc = (await databases.getDocument(
        APPWRITE_DATABASE_ID,
        TABLES.USER_PROFILES,
        appwriteUser.$id
      )) as unknown as UserProfileRow;
    } catch {
      // Fallback: query by userId if $id lookup misses
      try {
        const listRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          TABLES.USER_PROFILES,
          [Query.equal('userId', appwriteUser.$id), Query.limit(1)]
        );
        if (listRes.documents.length > 0) {
          profileDoc = listRes.documents[0] as unknown as UserProfileRow;
        }
      } catch {
        profileDoc = null;
      }
    }

    const fullName =
      profileDoc?.fullName ||
      appwriteUser.name ||
      `${prefs.firstName || 'Citizen'} ${prefs.lastName || ''}`.trim();
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Citizen';
    const lastName = nameParts.slice(1).join(' ') || '';

    const verificationStatus: VerificationStatus =
      (profileDoc?.accountVerificationStatus as VerificationStatus) ||
      'unverified';

    const barangay = normalizeBarangay(
      profileDoc?.barangay || prefs.barangay || 'Poblacion'
    );

    const profileImageId = profileDoc?.profileImageId || undefined;

    return {
      id: appwriteUser.$id,
      username: appwriteUser.email,
      email: appwriteUser.email,
      fullName,
      firstName,
      lastName,
      barangay,
      address: profileDoc?.address || prefs.address || '',
      contactNumber:
        profileDoc?.phone || prefs.contactNumber || prefs.phone || '',
      profileImageId,
      profileImageUrl: (await getOwnedImageUri(profileImageId)) || getMediaFileUrl(profileImageId),
      position: profileDoc?.position || '',
      employeeId: profileDoc?.employeeId || '',
      assignedArea: profileDoc?.assignedArea || barangay,
      shareAvatarOnListings: Boolean(profileDoc?.shareAvatarOnListings),
      accountVerificationStatus: verificationStatus,
      isVerified: verificationStatus === 'verified',
      theme: prefs.theme === 'dark' ? 'dark' : 'light',
      contractRole,
      role: contractRole === 'officer' ? 'VET_OFFICER' : 'CITIZEN',
      memberSince: appwriteUser.$createdAt,
    };
  },

  /**
   * Registers a new Pet Owner or Field Officer account in Appwrite.
   * If `requestedRole === 'officer'`, executes `blockPendingOfficer` and logs out immediately.
   */
  registerAccount: async (params: {
    fullName: string;
    email: string;
    password: string;
    phone: string;
    address: string;
    barangay: string;
    requestedRole: 'owner' | 'officer';
    position?: string;
    employeeId?: string;
    assignedArea?: string;
  }): Promise<{ pendingOfficer: boolean }> => {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.fullName.trim();
    const canonicalBrgy = normalizeBarangay(params.barangay);

    // 1. Create Auth account and temporary session
    await account.create(ID.unique(), cleanEmail, params.password, cleanName);
    await account.createEmailPasswordSession(cleanEmail, params.password);

    // 2. Save role & theme prefs
    await account.updatePrefs({
      requestedRole: params.requestedRole,
      theme: 'light',
      barangay: canonicalBrgy,
      contactNumber: params.phone.trim(),
    });

    // 3. Create/update `user_profiles` row through secure Function
    try {
      await operate('saveProfile', {
        fullName: cleanName,
        phone: params.phone.trim(),
        address: params.address.trim() || `${canonicalBrgy}, Iligan City`,
        barangay: canonicalBrgy,
        ...(params.requestedRole === 'officer'
          ? {
              position: params.position?.trim() || 'Field Officer',
              employeeId: params.employeeId?.trim() || 'PENDING',
              assignedArea: normalizeBarangay(
                params.assignedArea || canonicalBrgy
              ),
            }
          : {}),
      });
    } catch (e) {
      console.warn('Initial saveProfile warning:', e);
    }

    // 4. If Field Officer, invoke blockPendingOfficer and end session
    if (params.requestedRole === 'officer') {
      try {
        await operate('blockPendingOfficer', {});
      } catch (e) {
        console.warn('blockPendingOfficer notice:', e);
      }
      await account.deleteSession('current').catch(() => {});
      return { pendingOfficer: true };
    }

    // For Pet Owner, end temporary registration session so they log in cleanly (or keep if desired)
    await account.deleteSession('current').catch(() => {});
    return { pendingOfficer: false };
  },

  /**
   * Updates user profile fields via `saveProfile` Function action.
   */
  saveProfile: async (payload: {
    fullName: string;
    phone: string;
    address: string;
    barangay: string;
    position?: string;
    employeeId?: string;
    assignedArea?: string;
  }) => {
    return operate('saveProfile', {
      ...payload,
      barangay: normalizeBarangay(payload.barangay),
    });
  },

  /**
   * Uploads avatar to `cityvethub-media` and links it via `saveProfileImage`.
   */
  uploadAndSaveAvatar: async (asset: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
  }): Promise<string> => {
    const fileId = await uploadMediaFile(asset);
    try {
      await operate('saveProfileImage', { profileImageId: fileId });
    } catch (err: any) {
      // Preserve the original error stage instead of treating a file upload
      // success as a completed profile update. Never grant public access here.
      throw new Error(`Image uploaded but could not attach to your account: ${err?.message || 'Appwrite Function rejected the update'}`);
    }
    return fileId;
  },

  /**
   * Sets whether the owner's avatar is shown on their public adoption listings.
   */
  setProfilePhotoSharing: async (shareAvatarOnListings: boolean) => {
    return operate('setProfilePhotoSharing', { shareAvatarOnListings });
  },

  /**
   * Saves dark/light theme in Appwrite Account prefs while preserving `requestedRole`.
   */
  saveThemePreference: async (theme: 'light' | 'dark') => {
    const current = await account.get();
    const existingPrefs = (current.prefs || {}) as Record<string, any>;
    await account.updatePrefs({
      ...existingPrefs,
      theme,
    });
  },

  /**
   * Changes account password (contract web UI standard: 12+ chars recommended, 8+ min).
   */
  changePassword: async (currentPassword: string, newPassword: string) => {
    return account.updatePassword(newPassword, currentPassword);
  },

  /**
   * Changes account email address using current password.
   */
  changeEmail: async (newEmail: string, currentPassword: string) => {
    return account.updateEmail(newEmail.trim().toLowerCase(), currentPassword);
  },

  /**
   * Fetches active CVO-defined government ID categories from `id_categories`.
   */
  getActiveIdCategories: async (): Promise<IdCategoryRow[]> => {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      TABLES.ID_CATEGORIES,
      [Query.equal('isActive', true), Query.limit(50)]
    );
    return res.documents as unknown as IdCategoryRow[];
  },

  /**
   * Fetches the signed-in Pet Owner's latest verification request from `owner_verification_requests`.
   */
  getMyVerificationRequest: async (
    ownerId: string
  ): Promise<OwnerVerificationRequestRow | null> => {
    try {
      const res = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.OWNER_VERIFICATION_REQUESTS,
        [
          Query.equal('ownerId', ownerId),
          Query.orderDesc('$createdAt'),
          Query.limit(1),
        ]
      );
      if (res.documents.length > 0) {
        return res.documents[0] as unknown as OwnerVerificationRequestRow;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Uploads a private government ID photo and submits `requestAccountVerification`.
   * Prerequisite: Owner must have >= 1 owned pet in `pet_profiles`.
   */
  submitAccountVerification: async (params: {
    petProfileId: string;
    idCategoryId: string;
    asset: {
      uri: string;
      fileName?: string | null;
      mimeType?: string | null;
      fileSize?: number | null;
    };
  }) => {
    const documentFileId = await uploadMediaFile(params.asset);
    return operate('requestAccountVerification', {
      petProfileId: params.petProfileId,
      idCategoryId: params.idCategoryId,
      documentFileId,
    });
  },

  /**
   * Replaces the government ID file on a pending verification request.
   */
  replaceVerificationDocument: async (params: {
    requestId: string;
    asset: {
      uri: string;
      fileName?: string | null;
      mimeType?: string | null;
      fileSize?: number | null;
    };
  }) => {
    const documentFileId = await uploadMediaFile(params.asset);
    return operate('replaceVerificationDocument', {
      requestId: params.requestId,
      documentFileId,
    });
  },
};
```

## File: src/api/client.ts
```typescript
import 'react-native-url-polyfill/auto';
import { File, Paths } from 'expo-file-system';
import {
  Client,
  Account,
  Databases,
  Storage,
  Functions,
  Teams,
  ID,
} from 'react-native-appwrite';

// Verified Shared Appwrite Connection / Resource IDs (Phase 4.16 / 4.15 Backend)
export const APPWRITE_ENDPOINT =
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT ||
  'https://sgp.cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID =
  process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '6aeff5c9002718442fdf';
export const APPWRITE_DATABASE_ID =
  process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || 'cityvethub';
export const APPWRITE_FUNCTION_ID =
  process.env.EXPO_PUBLIC_APPWRITE_FUNCTION_ID || 'cityvethub-operations';
export const APPWRITE_MEDIA_BUCKET_ID =
  process.env.EXPO_PUBLIC_APPWRITE_MEDIA_BUCKET_ID || 'cityvethub-media';
export const TEAM_ADMINS =
  process.env.EXPO_PUBLIC_APPWRITE_ADMIN_TEAM_ID || 'cityvethub-admins';
export const TEAM_FIELD_OFFICERS =
  process.env.EXPO_PUBLIC_APPWRITE_OFFICER_TEAM_ID ||
  'cityvethub-field-officers';
export const ANDROID_PACKAGE_ID =
  process.env.EXPO_PUBLIC_ANDROID_PACKAGE || 'com.cityvethub.iligan';
export const PUBLIC_PASSPORT_BASE_URL =
  process.env.EXPO_PUBLIC_PUBLIC_PASSPORT_BASE_URL ||
  'https://cityvethub-iligan.web.app';

// All 19 Core Tables + 6 Server-Only Community Tables
export const TABLES = {
  USER_PROFILES: 'user_profiles',
  PET_PROFILES: 'pet_profiles',
  PET_REQUESTS: 'pet_requests',
  PETS: 'pets',
  PET_PASSPORTS: 'pet_passports',
  PET_REGISTRY_IDS: 'pet_registry_ids',
  PET_HEALTH_UPLOADS: 'pet_health_uploads',
  PET_PASSPORT_MEDICAL: 'pet_passport_medical',
  MEDICAL_RECORDS: 'medical_records',
  INCIDENT_CATEGORIES: 'incident_categories',
  DISEASE_REPORTS: 'disease_reports',
  DISEASE_INCIDENTS: 'disease_incidents', // Legacy staff table
  DISEASE_ALERTS: 'disease_alerts', // Staff-only alerts
  OUTBREAK_OWNER_NOTIFICATIONS: 'outbreak_owner_notifications', // Owner-directed alerts
  ADOPTION_LISTINGS: 'adoption_listings',
  ADOPTION_APPLICATIONS: 'adoption_applications',
  OWNERSHIP_HISTORY: 'ownership_history',
  ID_CATEGORIES: 'id_categories',
  OWNER_VERIFICATION_REQUESTS: 'owner_verification_requests',
  PET_MATCH_PREFERENCES: 'pet_match_preferences',
  PET_MATCH_NOTIFICATIONS: 'pet_match_notifications',
  // Server-only Community tables (Never query directly from client; use operate('community*'))
  COMMUNITY_CHANNELS: 'community_channels',
  COMMUNITY_MEMBERSHIPS: 'community_memberships',
  COMMUNITY_POSTS: 'community_posts',
  COMMUNITY_COMMENTS: 'community_comments',
  COMMUNITY_VOTES: 'community_votes',
  COMMUNITY_ANNOUNCEMENTS: 'community_announcements',
} as const;

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setPlatform(ANDROID_PACKAGE_ID);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export const teams = new Teams(client);

/**
 * Synchronous privileged Function execution wrapper for `cityvethub-operations`.
 * Compatible with both object-form and positional-form react-native-appwrite versions.
 */
export async function operate<T = any>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const bodyString = JSON.stringify({ action, ...payload });
  let execution: any;

  try {
    // Try standard object signature first
    execution = await (functions as any).createExecution({
      functionId: APPWRITE_FUNCTION_ID,
      body: bodyString,
      async: false,
    });
  } catch (err: any) {
    // Fallback if installed SDK version expects positional parameters
    if (
      err?.message?.includes('Missing required parameter') ||
      err?.name === 'TypeError'
    ) {
      execution = await (functions as any).createExecution(
        APPWRITE_FUNCTION_ID,
        bodyString,
        false
      );
    } else {
      throw err;
    }
  }

  let parsedBody: any = {};
  if (execution?.responseBody) {
    try {
      parsedBody = JSON.parse(execution.responseBody);
    } catch {
      parsedBody = {};
    }
  }

  const statusCode = Number(execution?.responseStatusCode || 200);
  if (
    execution?.status === 'failed' ||
    parsedBody?.ok === false ||
    parsedBody?.error ||
    statusCode >= 400
  ) {
    const stageInfo = parsedBody?.stage ? ` [${parsedBody.stage}]` : '';
    throw new Error(
      parsedBody?.error ||
        `Operation "${action}" failed${stageInfo} (Execution: ${
          execution?.$id || 'unknown'
        })`
    );
  }

  return (parsedBody?.data !== undefined ? parsedBody.data : parsedBody) as T;
}

/**
 * Uploads an image picked via expo-image-picker to the shared `cityvethub-media` bucket.
 * Enforces contract rules: <= 5,000,000 bytes, JPG/JPEG/PNG/WEBP only.
 */
export async function uploadMediaFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): Promise<string> {
  if (!asset?.uri) {
    throw new Error('No image file selected.');
  }

  if (asset.fileSize && asset.fileSize > 5_000_000) {
    throw new Error('Image size must be 5 MB or less.');
  }

  // Never mislabel HEIC, AVIF or video assets as JPEG. Appwrite's file
  // metadata must describe the real bytes; a changed filename is not a conversion.
  const supportedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const rawMime = (asset.mimeType || '').toLowerCase();
  if (rawMime && !supportedMimes.includes(rawMime)) {
    throw new Error('Unsupported image format. Select a JPG, PNG or WEBP photo.');
  }
  const rawExt = (asset.fileName || asset.uri).split('?')[0].split('.').pop()?.toLowerCase();
  const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  if (!rawMime && (!rawExt || !supportedExtensions.includes(rawExt))) {
    throw new Error('Cannot verify image format. Select a JPG, PNG or WEBP photo.');
  }
  const ext = rawMime ? rawMime.includes('png') ? 'png' : rawMime.includes('webp') ? 'webp' : 'jpg'
    : rawExt || 'jpg';
  const mimeType = rawMime || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

  // Expo ImagePicker sometimes omits fileSize. Never lie to Appwrite that
  // a real uploaded image is only 1024 bytes: it breaks multipart boundaries.
  let actualSize = asset.fileSize || 0;
  if (!actualSize) {
    try { actualSize = new File(asset.uri).size; }
    catch { /* clearer error below */ }
  }
  if (!actualSize || !Number.isFinite(actualSize)) {
    throw new Error('Cannot determine image size. Choose a JPG/PNG stored locally and retry.');
  }
  if (actualSize > 5_000_000) throw new Error('Image must be smaller than 5 MB.');
  const rawName = String(asset.fileName || `upload_${Date.now()}.${ext}`);
  const safeBase = rawName.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90) || `upload_${Date.now()}`;
  const cleanName = `${safeBase}.${ext}`;
  const filePayload = { name: cleanName, type: mimeType, size: actualSize, uri: asset.uri };

  const fileId = ID.unique();
  const uploaded = await storage.createFile({
    bucketId: APPWRITE_MEDIA_BUCKET_ID,
    fileId,
    file: filePayload,
    // Default Appwrite file permissions grant access only to the signed-in
    // user. Server Function expands access for authorized staff as needed.
  });

  return uploaded.$id;
}

/**
 * Retrieve a PRIVATE image with the authenticated Appwrite SDK and convert it
 * to an app-private file:// URI for React Native Image. A direct HTTP Image URL
 * does not include the Appwrite session and often displays a blank avatar.
 * Do not use this method for unrelated users' private files.
 */
const privateImageFiles = new Set<File>();
export async function getOwnedImageUri(fileId?: string | null): Promise<string | undefined> {
  if (!fileId) return undefined;
  try {
    const binary = await storage.getFileView({ bucketId: APPWRITE_MEDIA_BUCKET_ID, fileId });
    const target = new File(Paths.cache, `cvh_avatar_${fileId}.img`);
    target.write(new Uint8Array(binary));
    privateImageFiles.add(target);
    return target.uri;
  } catch (error) {
    console.warn('Private image view unavailable:', error);
    return undefined;
  }
}
export function clearPrivateImageCache() {
  for (const file of privateImageFiles) {
    try { if (file.exists) file.delete(); } catch { /* cache eviction best effort */ }
  }
  privateImageFiles.clear();
}

/**
 * Constructs a public view URL for an owner-consented Storage file ID in `cityvethub-media`.
 */
export function getMediaFileUrl(fileId?: string | null): string | undefined {
  if (!fileId || !fileId.trim()) return undefined;
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
    return fileId;
  }
  return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_MEDIA_BUCKET_ID}/files/${encodeURIComponent(
    fileId.trim()
  )}/view?project=${encodeURIComponent(APPWRITE_PROJECT_ID)}`;
}

/**
 * Constructs the canonical QR code URL for a pet profile.
 */
export function getPetPassportQrUrl(petProfileId: string): string {
  const cleanHost = PUBLIC_PASSPORT_BASE_URL.replace(/\/+$/, '');
  return `${cleanHost}/passport.html?pet=${encodeURIComponent(petProfileId)}`;
}

export default client;
```

## File: src/api/disease.ts
```typescript
import { Query } from 'react-native-appwrite';
import {
  databases,
  operate,
  APPWRITE_DATABASE_ID,
  TABLES,
} from './client';
import { DiseaseAlert } from '../store/types/surveillance';
import {
  getBarangayCoords,
  IliganBarangay,
  normalizeBarangay,
} from '../store/types/constants';

export const diseaseApi = {
  /**
   * Fetches active staff alerts from `disease_alerts` (for Field Officers).
   * Note: Pet Owners receive their official notices via `communityOfficialNotices`
   * and `outbreak_owner_notifications` inside the Community tab.
   */
  getActiveAlerts: async (): Promise<DiseaseAlert[]> => {
    const combinedAlerts: DiseaseAlert[] = [];

    try {
      const alertsRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.DISEASE_ALERTS,
        [Query.orderDesc('$createdAt'), Query.limit(100)]
      );

      alertsRes.documents.forEach((doc: any, idx: number) => {
        const canonicalBrgy = normalizeBarangay(doc.barangay);
        const baseCoords = getBarangayCoords(canonicalBrgy);

        if (!doc.isActive) return;
        combinedAlerts.push({
          id: doc.$id,
          title: doc.title || doc.diseaseType || 'CVO Staff Alert',
          disease: doc.diseaseType || 'Advisory',
          barangay: canonicalBrgy as IliganBarangay,
          severity: doc.severity || 'medium',
          status: doc.isActive ? 'VERIFIED' : 'RESOLVED',
          description: doc.message || '',
          created_at: doc.issuedAt || doc.$createdAt,
          lat: baseCoords.latitude + (idx % 3) * 0.0005,
          lng: baseCoords.longitude + (idx % 3) * 0.0005,
          isOutbreak: Boolean(doc.isOutbreak),
          sourceType: 'ALERT',
        });
      });
    } catch {
      // Non-staff users cannot read `disease_alerts` directly
    }

    return combinedAlerts;
  },

  /**
   * Submits an incident report via `cityvethub-operations` (`submitDisease`).
   * Contract Section 07 & 08.F:
   * - Requires `accountVerificationStatus === 'verified'` for Pet Owners, or approved Team membership for Field Officers.
   * - Validates coordinates within Philippine bounds (4 <= lat <= 22, 116 <= lng <= 127).
   */
  reportIncident: async (reportData: Partial<DiseaseAlert>): Promise<void> => {
    const barangay = normalizeBarangay(reportData.barangay);
    const defaultCoords = getBarangayCoords(barangay);

    const latitude =
      typeof reportData.lat === 'number' &&
      Number.isFinite(reportData.lat) &&
      reportData.lat >= 4 &&
      reportData.lat <= 22
        ? reportData.lat
        : defaultCoords.latitude;

    const longitude =
      typeof reportData.lng === 'number' &&
      Number.isFinite(reportData.lng) &&
      reportData.lng >= 116 &&
      reportData.lng <= 127
        ? reportData.lng
        : defaultCoords.longitude;

    const diseaseType = String(
      reportData.disease || reportData.title || ''
    ).trim();
    if (!diseaseType) {
      throw new Error('Please select an active incident category.');
    }

    await operate('submitDisease', {
      diseaseType,
      barangay,
      latitude,
      longitude,
      description: String(reportData.description || '').trim(),
      photoFileId: String(reportData.photoFileId || ''),
    });
  },
};
```

## File: src/api/phase422.ts
```typescript
/** CityVetHub Phase 4.22: all data is from the EXISTING shared Appwrite backend. */
import { Query } from 'react-native-appwrite';
import { account, databases, APPWRITE_DATABASE_ID, TABLES, operate } from './client';

export type PetSpeciesPreference = 'Any' | 'Dog' | 'Cat';
export type PetSexPreference = 'Any' | 'Male' | 'Female';
export interface PetMatchPreference {
  species: PetSpeciesPreference;
  breed: string;
  color: string;
  sex: PetSexPreference;
  minAgeYears: number;
  maxAgeYears: number;
  isEnabled: boolean;
  pushEnabled: boolean;
}
export interface PetMatchNotification {
  $id: string;
  listingId: string;
  petName: string;
  title: string;
  createdAt: string;
  isRead: boolean;
  pushStatus?: string;
}
export interface StaffIncidentDetails {
  $id: string;
  reporterName: string;
  reporterRole?: string;
  diseaseType: string;
  description?: string;
  barangay: string;
  latitude: number;
  longitude: number;
  reportedAt?: string;
  status?: string;
  photoUrl?: string; // temporary five-minute token URL; never store persistently
}
const required = [4, 22, 0];
export async function requirePhase422Backend() {
  const result = await operate<{build?:string}>('ping');
  const build = String(result?.build || '0.0.0');
  const digits = build.split('.').map(n => Number.parseInt(n, 10) || 0);
  const older = required.some((minimum, i) => {
    const precedingSame = required.slice(0, i).every((part, j) => digits[j] === part);
    return precedingSame && (digits[i] || 0) < minimum;
  });
  if (older) throw new Error(`CityVetHub backend ${build} is outdated. Deploy and activate Phase 4.22.0 or newer before using this feature.`);
  return build;
}
export const defaultMatchPreferences: PetMatchPreference = {
  species:'Any',breed:'',color:'',sex:'Any',minAgeYears:0,maxAgeYears:40,isEnabled:true,pushEnabled:false,
};
export async function getMatchPreferences(): Promise<PetMatchPreference> {
  await requirePhase422Backend();
  const saved = await operate<Partial<PetMatchPreference> | null>('getAdoptionPreferences');
  return {...defaultMatchPreferences,...(saved || {})};
}
export async function saveMatchPreferences(values: PetMatchPreference) {
  await requirePhase422Backend();
  if(!Number.isInteger(values.minAgeYears) || !Number.isInteger(values.maxAgeYears) || values.minAgeYears<0 || values.maxAgeYears>40 || values.minAgeYears>values.maxAgeYears) {
    throw new Error('Choose whole-number age limits between 0 and 40; minimum cannot exceed maximum.');
  }
  return operate('saveAdoptionPreferences', values as unknown as Record<string, unknown>);
}
export async function getMatchNotifications(): Promise<PetMatchNotification[]> {
  await requirePhase422Backend();
  const owner = await account.get();
  const rows: PetMatchNotification[]=[];
  let cursor='';
  for(let page=0;page<10;page++){
    // A private row-security table can be read by the owner without a composite
    // ownerId + createdAt index. Filter by owner again for defense in depth.
    const queries=[Query.limit(100)];
    if(cursor)queries.push(Query.cursorAfter(cursor));
    const res=await databases.listDocuments(APPWRITE_DATABASE_ID,TABLES.PET_MATCH_NOTIFICATIONS,queries);
    const docs=res.documents as unknown as PetMatchNotification[];
    rows.push(...docs.filter(row=>(row as any).ownerId===owner.$id));
    if(docs.length<100)break;
    cursor=docs[docs.length-1].$id;
  }
  return rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
export async function readMatchNotification(notificationId: string) {
  if (!notificationId) throw new Error('Notification ID is required.');
  return operate('markAdoptionMatchRead', {notificationId});
}
export async function fetchBreedCatalog(species:'Dog'|'Cat'): Promise<string[]> {
  await requirePhase422Backend();
  const response = await operate<{breeds?:string[]}>('getBreedCatalog',{species});
  return Array.isArray(response?.breeds) ? response.breeds.filter(b=>typeof b==='string'&&b.length>0) : [];
}
export const fallbackBreedCatalog: Record<'Dog'|'Cat',string[]> = {
  Dog:['Aspin (Philippine native dog)','Beagle','Chihuahua','Dachshund','German Shepherd','Golden Retriever','Labrador Retriever','Mixed Breed','Pomeranian','Poodle','Pug','Shih Tzu','Siberian Husky','Other / Unknown'],
  Cat:['Domestic Shorthair','Domestic Longhair','Puspin','Persian','Siamese','British Shorthair','Bengal','Maine Coon','Ragdoll','Mixed Breed','Other / Unknown'],
};
export async function getStaffIncidentDetails(reportId:string) {
  await requirePhase422Backend();
  return operate<StaffIncidentDetails>('getIncidentReportDetails',{reportId});
}
```

## File: src/components/BreedPicker.tsx
```typescript
import React, {useEffect, useState} from 'react';
import {Picker} from '@react-native-picker/picker';
import {Text, TextInput, View} from 'react-native';
import {fallbackBreedCatalog, fetchBreedCatalog} from '../api/phase422';

/** Always retain old pet breed value, including names absent from the current API list. */
export default function BreedPicker({species,value,onChange}:{species:'Dog'|'Cat';value:string;onChange:(breed:string)=>void}) {
  const [available,setAvailable]=useState<string[]>(fallbackBreedCatalog[species]);
  useEffect(()=>{
    let alive=true;
    setAvailable(fallbackBreedCatalog[species]);
    fetchBreedCatalog(species).then(result=>{if(alive&&result.length)setAvailable(result);}).catch(()=>{});
    return()=>{alive=false;};
  },[species]);
  const choices=['',...new Set([...available,value].filter(Boolean))];
  return <View>
    <View style={{borderWidth:1,borderColor:'#CBD5E1',borderRadius:10,backgroundColor:'#FFFFFF',marginBottom:8}}>
      <Picker selectedValue={value} onValueChange={v=>onChange(String(v))} style={{color:'#1E293B'}}>
        {choices.map(v=><Picker.Item key={v} label={v||'Select a breed'} value={v}/>)}
      </Picker>
    </View>
    <Text style={{color:'#64748B',fontSize:11,marginBottom:4}}>Not listed? Enter your pet's breed below.</Text>
    <TextInput style={{borderWidth:1,borderRadius:10,borderColor:'#CBD5E1',padding:10,color:'#1E293B',marginBottom:12}}
      placeholder="Other / mixed breed" placeholderTextColor="#94A3B8" maxLength={100} value={value} onChangeText={onChange}/>
  </View>;
}
```

## File: src/components/CallButton.tsx
```typescript
import React from 'react';
import { Alert, Linking, Pressable, Text, ViewStyle } from 'react-native';

/** Does not dial automatically: asks before opening the native dialer. */
export default function CallButton({ phone, style }: { phone?: string | null; style?: ViewStyle }) {
  const normalized = String(phone || '').replace(/[^+0-9]/g, '');
  if (normalized.length < 7) return null;
  const call = () => Alert.alert('Call this number?', normalized, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Dialer', onPress: async () => {
      try { await Linking.openURL(`tel:${normalized}`); }
      catch { Alert.alert('Unavailable', 'No phone dialer was found on this device.'); }
    } },
  ]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Call ${normalized}`} onPress={call}
      style={[{ backgroundColor: '#E8F1FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
        alignItems: 'center', justifyContent: 'center' }, style]}>
    <Text style={{ color: '#2463CE', fontWeight: '700', fontSize: 12 }}>📞 Call</Text>
  </Pressable>;
}
```

## File: src/components/FullscreenMap.tsx
```typescript
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAppPalette } from '../theme';

/** Leaflet WebView surface displayed above the tab bar and Android navigation inset. */
export default function FullscreenMap({ visible, onClose, html, onPick, title = 'Incident map' }: {
  visible: boolean; onClose: () => void; html: string;
  onPick: (latitude: number, longitude: number) => void; title?: string;
}) {
  const colors = useAppPalette();
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView edges={['top','bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{title}</Text>
          <Text style={{ color: colors.secondary, fontSize: 12 }}>Tap a location to select coordinates</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}
          style={{ backgroundColor: colors.primaryMuted, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>Done ✕</Text>
        </TouchableOpacity>
      </View>
      <WebView style={{ flex: 1 }} source={{ html }} originWhitelist={['*']} javaScriptEnabled
        onMessage={(event) => {
          try { const value = JSON.parse(event.nativeEvent.data);
            if (Number.isFinite(value.lat) && Number.isFinite(value.lng)) onPick(value.lat, value.lng);
          } catch { /* Malformed map messages are ignored */ }
        }}/>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }}>
        <Text style={{ color: colors.secondary, fontSize: 12 }}>Map data © OpenStreetMap contributors. Coordinates can be refined before submitting.</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}
```

## File: src/components/README.md
```markdown
# Reusable UI components
(buttons, cards, map markers)
```

## File: src/navigation/AppNavigator.tsx
```typescript
import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useAppPalette } from '../theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import OwnedPetPassportScreen from '../screens/Profile/OwnedPetPassportScreen';

// Navigators
import TabNavigator from './TabNavigator';
import OfficerTabNavigator from './OfficerTabNavigator';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Pet Adoption Detail Screen
import PetDetailScreen from '../screens/Adoption/PetDetailScreen';

// Global Auth State
import { useAuthStore } from '../store';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuthStore();
  const colors = useAppPalette();
  const navTheme = {
    ...(user?.theme === 'dark' ? DarkTheme : DefaultTheme),
    colors: { ...(user?.theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background, card: colors.surface, text: colors.text,
      border: colors.border, primary: colors.primary },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        ) : user?.contractRole === 'officer' ? (
          // Approved Field Officer Workflows (cityvethub-field-officers Team Member)
          <Stack.Group>
            <Stack.Screen name="OfficerApp" component={OfficerTabNavigator} />
            <Stack.Screen
              name="PetDetail"
              component={PetDetailScreen}
              options={{
                headerShown: true,
                title: 'Listing Details (Read-Only)',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
          </Stack.Group>
        ) : (
          // Pet Owner Workflows
          <Stack.Group>
            <Stack.Screen name="MainApp" component={TabNavigator} />
            <Stack.Screen
              name="PetDetail"
              component={PetDetailScreen}
              options={{
                headerShown: true,
                title: 'Adoption Listing',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="OwnedPetPassport"
              component={OwnedPetPassportScreen}
              options={{
                headerShown: true,
                title: 'My Pet & QR Passport',
                headerTintColor: '#1E293B',
                headerBackTitle: 'Back',
              }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## File: src/navigation/OfficerTabNavigator.tsx
```typescript
import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../theme';
import SettingsScreen from '../screens/Profile/SettingsScreen';

import FieldLookupScreen from '../screens/Officer/FieldLookupScreen';
import FieldIncidentScreen from '../screens/Officer/FieldIncidentScreen';
import OcularQueueScreen from '../screens/Officer/OcularQueueScreen';
import AdoptionFeed from '../screens/Adoption/AdoptionFeed';

const Tab = createBottomTabNavigator();

export default function OfficerTabNavigator() {
  const insets = useSafeAreaInsets();
  const colors = useAppPalette();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingTop: 5,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          height: 56 + Math.max(8, insets.bottom),
        },
      }}
    >
      <Tab.Screen
        name="FieldLookup"
        component={FieldLookupScreen}
        options={{
          headerShown: false,
          title: 'QR Lookup & Medical',
          tabBarLabel: 'QR & Medical',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🔍</Text>
          ),
        }}
      />
      <Tab.Screen
        name="FieldIncidents"
        component={FieldIncidentScreen}
        options={{
          headerShown: false,
          title: 'Incident Surveillance',
          tabBarLabel: 'Surveillance',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🗺️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="OcularQueue"
        component={OcularQueueScreen}
        options={{
          headerShown: false,
          title: 'Staff Alerts & Profile',
          tabBarLabel: 'Staff Alerts',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🚨</Text>
          ),
        }}
      />
      <Tab.Screen
        name="OfficerAdoptions"
        component={AdoptionFeed}
        options={{
          title: 'Adoptions Directory (Read-Only)',
          tabBarLabel: 'Adoptions',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 17 }}>🐾</Text>
          ),
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{
        title: 'Settings', tabBarLabel: 'Settings',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
      }}/>
    </Tab.Navigator>
  );
}
```

## File: src/navigation/TabNavigator.tsx
```typescript
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../theme';
import SettingsScreen from '../screens/Profile/SettingsScreen';

// Pet Owner Screens
import AdoptionFeed from '../screens/Adoption/AdoptionFeed';
import DiseaseMap from '../screens/Surveillance/DiseaseMap';
import CommunityScreen from '../screens/Community/CommunityScreen';
import UserProfileScreen from '../screens/Profile/UserProfileScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const colors = useAppPalette();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          height: 56 + Math.max(8, insets.bottom),
        },
      }}
    >
      <Tab.Screen
        name="AdoptionFeed"
        component={AdoptionFeed}
        options={{
          title: 'Pet Adoptions',
          tabBarLabel: 'Adoptions',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🐾</Text>
          ),
        }}
      />
      <Tab.Screen
        name="SurveillanceMap"
        component={DiseaseMap}
        options={{
          title: 'Report an Incident',
          tabBarLabel: 'Incidents',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📍</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          title: 'Community & CVO Notices',
          tabBarLabel: 'Community',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          title: 'My Pets & Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>👤</Text>
          ),
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{
        title: 'Settings', tabBarLabel: 'Settings',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
      }}/>
    </Tab.Navigator>
  );
}
```

## File: src/navigation/types.ts
```typescript
import { NavigatorScreenParams } from '@react-navigation/native';
import { PetPassport } from '../store/types/pets';

// Pet Owner Main Tab Routes (Phase 4.16 includes Community)
export type MainTabParamList = {
  AdoptionFeed: undefined;
  SurveillanceMap: undefined;
  Community: undefined;
  UserProfile: undefined;
  Settings: undefined;
};

// Root Stack Routes
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainApp: NavigatorScreenParams<MainTabParamList> | undefined;
  OfficerApp: undefined;
  PetDetail: { pet: PetPassport | any; isOwned?: boolean };
  ApplyAdoption: { petId: string | number };
  ReportIncident: undefined;
  OwnedPetPassport: { pet: any };
};
```

## File: src/screens/Adoption/AdoptionFeed.tsx
```typescript
import { useThemedStyles } from '../../theme';
import AdoptionMatchesPanel from './AdoptionMatchesPanel';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { Query } from 'react-native-appwrite';
import { useAdoptionStore, useAuthStore } from '../../store/index';
import {
  databases,
  APPWRITE_DATABASE_ID,
  TABLES,
} from '../../api/client';
import { ILIGAN_BARANGAYS } from '../../store/types/constants';
import { PetProfileRow } from '../../store/types/pets';

export default function AdoptionFeed() {
  const styles = useThemedStyles(baseStyles);
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { availablePets, fetchAvailablePets, listOwnPet, isLoading } =
    useAdoptionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [matchesVisible,setMatchesVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Dog' | 'Cat'>(
    'All'
  );
  const [housingFilter, setHousingFilter] = useState<
    'all' | 'any' | 'apartment' | 'house' | 'yard'
  >('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('All');

  // Create Listing Modal State (Owner Only)
  const [isListModalVisible, setIsListModalVisible] = useState(false);
  const [unlistedPets, setUnlistedPets] = useState<PetProfileRow[]>([]);
  const [selectedPetProfileId, setSelectedPetProfileId] = useState<string>('');
  const [listingTitle, setListingTitle] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingRequirements, setListingRequirements] = useState(
    'Safe indoor/outdoor space and commitment to regular veterinary care.'
  );
  const [listingHousing, setListingHousing] = useState<
    'any' | 'apartment' | 'house' | 'yard'
  >('any');
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [showOwnerName, setShowOwnerName] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(false);

  const loadUnlistedOwnedPets = useCallback(async () => {
    if (!user?.id || user.contractRole === 'officer') return;
    try {
      const ownedRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.PET_PROFILES,
        [Query.equal('ownerId', String(user.id)), Query.limit(100)]
      );
      const allOwned = ownedRes.documents as unknown as PetProfileRow[];

      // Exclude pets that already have an active non-adopted listing
      const listedIds = new Set(
        availablePets
          .filter(
            (l) =>
              l.isActive !== false &&
              String(l.status || '').toUpperCase() !== 'ADOPTED'
          )
          .map((l) => String(l.petProfileId || l.petId))
      );

      const eligible = allOwned.filter((p) => !listedIds.has(p.$id));
      setUnlistedPets(eligible);
      if (eligible.length > 0) {
        setSelectedPetProfileId(eligible[0].$id);
        setListingTitle(`Adopt ${eligible[0].petName} (${eligible[0].breed})`);
      } else {
        setSelectedPetProfileId('');
      }
    } catch {
      setUnlistedPets([]);
    }
  }, [user, availablePets]);

  useEffect(() => {
    fetchAvailablePets();
  }, [fetchAvailablePets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailablePets();
    setRefreshing(false);
  };

  // Contract Section 08.E: Filter by species, housing, and barangay (NO activityLevel filter)
  const filteredPets = availablePets.filter((item) => {
    const pet = item.registered_pet;
    if (!pet) return false;

    const matchesSearch =
      (pet.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pet.breed || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pet.barangay || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSpecies =
      speciesFilter === 'All' ||
      (pet.species || '').toLowerCase() === speciesFilter.toLowerCase();

    const itemHousing = String(item.housingRequirement || 'any').toLowerCase();
    const matchesHousing =
      housingFilter === 'all' || itemHousing === housingFilter;

    const matchesBarangay =
      barangayFilter === 'All' || pet.barangay === barangayFilter;

    return (
      matchesSearch && matchesSpecies && matchesHousing && matchesBarangay
    );
  });

  const handleOpenCreateListing = async () => {
    await loadUnlistedOwnedPets();
    setIsListModalVisible(true);
  };

  const handleCreateListing = async () => {
    if (!selectedPetProfileId) {
      Alert.alert(
        'No Unlisted Pet Available',
        'Please add a pet in your Profile > My Pets tab first, or select a pet that is not already listed.'
      );
      return;
    }
    if (!listingTitle.trim() || !listingDescription.trim()) {
      Alert.alert(
        'Missing Fields',
        'Please provide a listing title and description.'
      );
      return;
    }

    try {
      await listOwnPet({
        petProfileId: selectedPetProfileId,
        title: listingTitle.trim(),
        description: listingDescription.trim(),
        requirements: listingRequirements.trim(),
        housingRequirement: listingHousing,
        publishPetPhoto,
        showOwnerName,
        publishOwnerPhoto,
      });
      setIsListModalVisible(false);
      setListingDescription('');
      Alert.alert(
        'Listing Published!',
        'Your pet is now visible on the Adoption Feed.'
      );
    } catch (error: any) {
      Alert.alert(
        'Could Not List Pet',
        error?.message ||
          'Failed to publish listing. Check that your pet has a photo if photo sharing is enabled.'
      );
    }
  };

  /** One listing-opening path for both feed cards and private match alerts. */
  const openPetDetail = (item: any) => {
    const pet = item.registered_pet;
    if (!pet) {
      Alert.alert('Listing unavailable', 'This adoption listing is no longer accessible.');
      return;
    }
    const isMyListing = Boolean(user?.id && String(item.postedById) === String(user.id));
    const housingTag = item.housingRequirement === 'apartment' ? '🏢 Apartment Friendly'
      : item.housingRequirement === 'house' ? '🏠 House Required'
      : item.housingRequirement === 'yard' ? '🌳 Yard Required' : '🏡 Any Housing';
    navigation.navigate('PetDetail', {
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
                pet.ageYears !== undefined
                  ? `${pet.ageYears} yr(s)`
                  : '1 yr(s)',
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
          });
  };

  const renderPetItem = ({ item }: { item: any }) => {
    const pet = item.registered_pet;
    const isMyListing = Boolean(
      user?.id && String(item.postedById) === String(user.id)
    );
    const housingTag =
      item.housingRequirement === 'apartment'
        ? '🏢 Apartment Friendly'
        : item.housingRequirement === 'house'
        ? '🏠 House Required'
        : item.housingRequirement === 'yard'
        ? '🌳 Yard Required'
        : '🏡 Any Housing';

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.85}
        onPress={() => openPetDetail(item)}
      >
        <Image
          source={{ uri: pet.photo }}
          style={styles.petImage}
          resizeMode="cover"
        />

        <View style={styles.cardInfo}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{item.title || pet.name}</Text>
              <Text style={styles.petBreed}>
                {pet.breed} • {pet.species === 'CAT' ? 'Cat' : 'Dog'} • Brgy.{' '}
                {pet.barangay}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                String(item.status).toUpperCase() === 'RESERVED' && {
                  backgroundColor: '#FEF3C7',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  String(item.status).toUpperCase() === 'RESERVED' && {
                    color: '#B45309',
                  },
                ]}
              >
                {item.status || 'AVAILABLE'}
              </Text>
            </View>
          </View>

          {/* Owner & Verification Row */}
          <View style={styles.ownerMetaRow}>
            {item.ownerAvatarUrl ? (
              <Image
                source={{ uri: item.ownerAvatarUrl }}
                style={styles.ownerAvatarSmall}
              />
            ) : (
              <View style={styles.ownerAvatarPlaceholder}>
                <Text style={styles.ownerAvatarInitial}>
                  {(item.ownerDisplayName || 'P')[0]}
                </Text>
              </View>
            )}
            <Text style={styles.ownerNameText}>
              Posted by {isMyListing ? 'You' : item.ownerDisplayName}
            </Text>
            {item.verificationStatus === 'verified' && (
              <View style={styles.verifiedPetPill}>
                <Text style={styles.verifiedPetPillText}>✓ CVO Verified</Text>
              </View>
            )}
          </View>

          {/* Housing & Barangay Pills */}
          <View style={styles.tagRow}>
            <View style={styles.traitPill}>
              <Text style={styles.traitText}>{housingTag}</Text>
            </View>
            {isMyListing && (
              <View
                style={[
                  styles.traitPill,
                  { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
                ]}
              >
                <Text style={[styles.traitText, { color: '#166534' }]}>
                  My Listing (Tap to Manage)
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {user?.contractRole !== 'officer' && <>
        <TouchableOpacity accessibilityRole="button" onPress={()=>setMatchesVisible(true)}
          style={{marginHorizontal:15,marginTop:10,marginBottom:6,padding:13,borderRadius:13,backgroundColor:'#DCFCE7',borderColor:'#86EFAC',borderWidth:1}}>
          <Text style={{color:'#166534',fontSize:14,fontWeight:'800'}}>🔔 Match preferences & adoption alerts</Text>
        </TouchableOpacity>
        <AdoptionMatchesPanel visible={matchesVisible} onClose={()=>setMatchesVisible(false)} onOpenListing={async(listingId)=>{
          setMatchesVisible(false);
          const match=availablePets.find(item=>String(item.listingId||item.id)===listingId);
          if(!match){Alert.alert('Listing unavailable','This pet listing is no longer active, or you need to refresh the adoption feed.');return;}
          openPetDetail(match);
        }}/>
      </>}
      {/* Top Search & "+ List My Pet" Button */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by pet name, breed, or barangay..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {user?.contractRole !== 'officer' && (
          <TouchableOpacity
            style={styles.listPetBtn}
            onPress={handleOpenCreateListing}
          >
            <Text style={styles.listPetBtnText}>+ List Pet</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter 1: Species Selector */}
      <View style={styles.speciesRow}>
        {(['All', 'Dog', 'Cat'] as const).map((sp) => (
          <TouchableOpacity
            key={sp}
            style={[
              styles.speciesBtn,
              speciesFilter === sp && styles.speciesBtnActive,
            ]}
            onPress={() => setSpeciesFilter(sp)}
          >
            <Text
              style={[
                styles.speciesBtnText,
                speciesFilter === sp && styles.speciesBtnTextActive,
              ]}
            >
              {sp === 'All'
                ? '🐾 All Species'
                : sp === 'Dog'
                ? '🐶 Dogs'
                : '🐱 Cats'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter 2: Housing Requirement & Barangay Filter */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={
            [
              { key: 'all', label: 'All Housing' },
              { key: 'any', label: 'Any Home' },
              { key: 'apartment', label: 'Apartment' },
              { key: 'house', label: 'House' },
              { key: 'yard', label: 'Yard Required' },
            ] as const
          }
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterPill,
                housingFilter === item.key && styles.filterPillActive,
              ]}
              onPress={() => setHousingFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  housingFilter === item.key && styles.filterPillTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        <View style={styles.brgyFilterWrap}>
          <Picker
            selectedValue={barangayFilter}
            onValueChange={(v) => setBarangayFilter(String(v))}
            style={{ color: '#334155', width: '100%' }}
          >
            <Picker.Item label="📍 All 44 Iligan Barangays" value="All" />
            {ILIGAN_BARANGAYS.map((b) => (
              <Picker.Item key={b} label={`Brgy. ${b}`} value={b} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Adoption Cards */}
      <FlatList
        data={filteredPets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPetItem}
        contentContainerStyle={styles.feedList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#00AEEF']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Matching Adoption Listings</Text>
            <Text style={styles.emptySubtitle}>
              Pull down to refresh or adjust your Species, Housing, or Barangay
              filters.
            </Text>
          </View>
        }
      />

      {/* Modal: List Owned Pet for Adoption (`listOwnPetForAdoption`) */}
      <Modal
        visible={isListModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsListModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>List Owned Pet for Adoption</Text>
              <Text style={styles.modalSub}>
                Select one of your unlisted pets from your inventory.
              </Text>

              <Text style={styles.fieldLabel}>Select Owned Pet *</Text>
              {unlistedPets.length === 0 ? (
                <Text style={{ color: '#D9534F', fontSize: 12 }}>
                  All of your pets are already listed, or you have not added a
                  pet in Profile &gt; My Pets yet.
                </Text>
              ) : (
                <View style={styles.pickerBox}>
                  <Picker
                    selectedValue={selectedPetProfileId}
                    onValueChange={(val) => {
                      setSelectedPetProfileId(String(val));
                      const found = unlistedPets.find((p) => p.$id === val);
                      if (found) {
                        setListingTitle(
                          `Adopt ${found.petName} (${found.breed})`
                        );
                      }
                    }}
                  >
                    {unlistedPets.map((p) => (
                      <Picker.Item
                        key={p.$id}
                        label={`${p.petName} (${p.species} • ${p.breed})`}
                        value={p.$id}
                      />
                    ))}
                  </Picker>
                </View>
              )}

              <Text style={styles.fieldLabel}>Listing Headline *</Text>
              <TextInput
                style={styles.textInput}
                value={listingTitle}
                onChangeText={setListingTitle}
                placeholder="e.g. Sweet Aspin Puppy Looking for Home"
              />

              <Text style={styles.fieldLabel}>Description / Pet Story *</Text>
              <TextInput
                style={[styles.textInput, { height: 75 }]}
                value={listingDescription}
                onChangeText={setListingDescription}
                placeholder="Share personality, habits, and reason for rehoming..."
                multiline
              />

              <Text style={styles.fieldLabel}>Adopter Requirements</Text>
              <TextInput
                style={styles.textInput}
                value={listingRequirements}
                onChangeText={setListingRequirements}
              />

              <Text style={styles.fieldLabel}>Housing Requirement</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={listingHousing}
                  onValueChange={(v) => setListingHousing(v as any)}
                >
                  <Picker.Item label="Any Suitable Home" value="any" />
                  <Picker.Item label="Apartment Friendly" value="apartment" />
                  <Picker.Item label="House Required" value="house" />
                  <Picker.Item label="Fenced Yard Required" value="yard" />
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Photo & Identity Consent</Text>
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
                  Publish My Avatar on Listing
                </Text>
                <Switch
                  value={publishOwnerPhoto}
                  onValueChange={setPublishOwnerPhoto}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsListModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreateListing}
                  disabled={isLoading || unlistedPets.length === 0}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Publish Listing</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listPetBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  listPetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  speciesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  speciesBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  speciesBtnActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  speciesBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  speciesBtnTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterList: { paddingHorizontal: 16, gap: 8, marginBottom: 6 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  filterPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  brgyFilterWrap: {
    marginHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    justifyContent: 'center',
  },
  feedList: { padding: 16, paddingBottom: 32 },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    elevation: 2,
  },
  petImage: { width: '100%', height: 185 },
  cardInfo: { padding: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  petBreed: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: { color: '#166534', fontSize: 10, fontWeight: 'bold' },
  ownerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  ownerAvatarSmall: { width: 22, height: 22, borderRadius: 11 },
  ownerAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarInitial: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  ownerNameText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  verifiedPetPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedPetPillText: { fontSize: 10, fontWeight: 'bold', color: '#166534' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  traitPill: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  traitText: { color: '#0284C7', fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
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
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
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
```

## File: src/screens/Adoption/AdoptionMatchesPanel.tsx
```typescript
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useAppPalette} from '../../theme';
import {
  defaultMatchPreferences, fallbackBreedCatalog, fetchBreedCatalog,
  getMatchNotifications, getMatchPreferences, PetMatchNotification, PetMatchPreference,
  readMatchNotification, saveMatchPreferences,
} from '../../api/phase422';

const COLORS=['','Black','White','Brown','Cream','Gray','Orange','Golden','Tan','Ginger','Calico','Tortoiseshell','Tabby','Brindle','Spotted','Mixed','Other / Unknown'];

export default function AdoptionMatchesPanel({visible,onClose,onOpenListing}:{
  visible:boolean;
  onClose:()=>void;
  onOpenListing:(listingId:string)=>void;
}) {
  const colors=useAppPalette();
  const [prefs,setPrefs]=useState<PetMatchPreference>(defaultMatchPreferences);
  const [notifications,setNotifications]=useState<PetMatchNotification[]>([]);
  const [breeds,setBreeds]=useState<string[]>(fallbackBreedCatalog.Dog);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [ageMin,setAgeMin]=useState('0');
  const [ageMax,setAgeMax]=useState('40');
  const setPreference=<K extends keyof PetMatchPreference>(key:K,value:PetMatchPreference[K])=>setPrefs(current=>({...current,[key]:value}));
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const [saved,notes] = await Promise.all([getMatchPreferences(),getMatchNotifications()]);
      setPrefs(saved);setAgeMin(String(saved.minAgeYears));setAgeMax(String(saved.maxAgeYears));setNotifications(notes);
    } catch(e:any){setError(e?.message||'Unable to load your adoption preferences.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(visible)load();},[visible,load]);
  useEffect(()=>{
    if(!visible)return;
    if(prefs.species==='Any'){setBreeds([]);return;}
    let current=true;
    setBreeds(fallbackBreedCatalog[prefs.species]);
    fetchBreedCatalog(prefs.species).then(list=>{
      if(current && list.length)setBreeds(list);
    }).catch(()=>{});
    return()=>{current=false;};
  },[prefs.species,visible]);
  const save=async()=>{
    setBusy(true);
    try {
      const min=Number(ageMin),max=Number(ageMax);
      if(!/^\d+$/.test(ageMin)||!/^\d+$/.test(ageMax)||!Number.isInteger(min)||!Number.isInteger(max))
        throw new Error('Please use whole numbers for both age limits.');
      const updated={...prefs,minAgeYears:min,maxAgeYears:max};
      await saveMatchPreferences(updated);
      setPrefs(updated);
      Alert.alert('Preferences saved','New matching adoption listings will create private in-app notifications. Existing listings are not backfilled.');
    }catch(e:any){Alert.alert('Unable to save',e?.message||'Check your input and retry.');}
    finally{setBusy(false);}
  };
  const openNote=async(note:PetMatchNotification)=>{
    if(!note.isRead){
      try {await readMatchNotification(note.$id);setNotifications(previous=>previous.map(n=>n.$id===note.$id?{...n,isRead:true}:n));}
      catch(e:any){Alert.alert('Could not mark as read',e?.message||'Please retry.');}
    }
    onOpenListing(note.listingId);
  };
  const box={backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:13,padding:12,marginBottom:12} as const;
  const label=(value:string)=><Text style={{color:colors.text,fontSize:13,fontWeight:'700',marginBottom:5}}>{value}</Text>;
  const picker=(value:string,options:string[],onChange:(v:string)=>void)=><View style={box}><Picker selectedValue={value} onValueChange={onChange} style={{color:colors.text}}>
    {options.map(option=><Picker.Item key={option} label={option||'Any'} value={option}/>)}</Picker></View>;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
    <View style={{flex:1,backgroundColor:colors.background,paddingTop:22}}>
      <View style={{paddingHorizontal:17,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <Text style={{fontSize:21,color:colors.text,fontWeight:'800'}}>Adoption matching</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={{color:colors.primary,fontWeight:'700'}}>Close</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{padding:17,paddingBottom:55}} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/> }>
        <Text style={{color:colors.secondary,marginBottom:16,lineHeight:20}}>Choose what kind of pet you are looking for. Only new listings matching all selected preferences trigger an alert.</Text>
        {!!error&&<Text style={{color:'#B91C1C',marginBottom:12}}>{error}</Text>}
        {label('Pet type')}
        {picker(prefs.species,['Any','Dog','Cat'],v=>setPrefs(curr=>({...curr,species:v as PetMatchPreference['species'],breed:''})))}
        {label('Breed')}
        {prefs.species==='Any'?<Text style={{color:colors.secondary,marginBottom:13}}>Choose Dog or Cat first to filter by breed.</Text>:
          picker(prefs.breed,['',...new Set([...breeds,prefs.breed].filter(Boolean))],v=>setPreference('breed',v))}
        {label('Coat color')}
        {picker(prefs.color,[...new Set([...COLORS,prefs.color].filter((x,i,a)=>a.indexOf(x)===i))],v=>setPreference('color',v))}
        {label('Sex')}
        {picker(prefs.sex,['Any','Male','Female'],v=>setPreference('sex',v as PetMatchPreference['sex']))}
        <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
          <View style={{flex:1}}>{label('Minimum age (years)')}
            <TextInput keyboardType="number-pad" maxLength={2} value={ageMin} onChangeText={setAgeMin} style={[box,{color:colors.text,marginBottom:0}]}/></View>
          <View style={{flex:1}}>{label('Maximum age (years)')}
            <TextInput keyboardType="number-pad" maxLength={2} value={ageMax} onChangeText={setAgeMax} style={[box,{color:colors.text,marginBottom:0}]}/></View>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <Text style={{color:colors.text,fontWeight:'700',flex:1}}>Enable adoption matching</Text>
          <Switch value={prefs.isEnabled} onValueChange={v=>setPreference('isEnabled',v)}/>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <Text style={{color:colors.text,fontWeight:'700',flex:1}}>Request push notifications</Text>
          <Switch value={prefs.pushEnabled} onValueChange={v=>setPreference('pushEnabled',v)}/>
        </View>
        <Text style={{color:colors.secondary,fontSize:11,marginBottom:15}}>In-app alerts work independently. Android push additionally requires an installed development build, notification permissions, and an Appwrite Messaging provider/registered device target.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy||loading} onPress={save} style={{backgroundColor:colors.primary,borderRadius:12,padding:14,alignItems:'center',marginBottom:22,opacity:busy?.6:1}}>
          <Text style={{color:'#FFFFFF',fontWeight:'800'}}>{busy?'Saving...':'Save my preferences'}</Text>
        </TouchableOpacity>
        <Text style={{color:colors.text,fontSize:19,fontWeight:'800',marginBottom:10}}>My match notifications ({notifications.filter(n=>!n.isRead).length} unread)</Text>
        {!notifications.length && !loading && <Text style={{color:colors.secondary,marginBottom:12}}>No matching adoption alerts yet.</Text>}
        {notifications.map(note=><TouchableOpacity key={note.$id} accessibilityRole="button" onPress={()=>openNote(note)} style={[box,{borderLeftWidth:4,borderLeftColor:note.isRead?colors.border:colors.primary}]}>
          <Text style={{color:colors.text,fontSize:14,fontWeight:note.isRead?'500':'800'}}>{note.title||note.petName||'Matching pet'}</Text>
          <Text style={{color:colors.secondary,fontSize:12,marginTop:5}}>{new Date(note.createdAt||Date.now()).toLocaleString()} · {note.isRead?'Read':'New'}</Text>
          <Text style={{color:colors.primary,fontSize:12,marginTop:6}}>Open matching adoption listing ›</Text>
        </TouchableOpacity>)}
      </ScrollView>
    </View>
  </Modal>;
}
```

## File: src/screens/Adoption/PetDetailScreen.tsx
```typescript
import CallButton from '../../components/CallButton';
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useAdoptionStore } from '../../store/index';
import { operate } from '../../api/client';

export default function PetDetailScreen() {
  const styles = useThemedStyles(baseStyles);
  const route = useRoute();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const {
    submitApplication,
    incomingApplications,
    fetchIncomingApplications,
    reviewApplication,
    confirmTransfer,
    toggleListingVisibility,
    fetchAvailablePets,
    isLoading,
  } = useAdoptionStore();

  const params = route.params as any;
  const rawPet = params?.pet || {};
  const isOwnerOfListing = Boolean(
    params?.isOwned ||
      (user?.id &&
        rawPet.postedById &&
        String(rawPet.postedById) === String(user.id))
  );
  const isOfficer = user?.contractRole === 'officer';

  const pet = {
    id: String(rawPet.id || '1'),
    listingId: String(rawPet.listingId || rawPet.id || '1'),
    petId: String(rawPet.petId || rawPet.id || '1'),
    petProfileId: String(rawPet.petProfileId || rawPet.petId || '1'),
    title: rawPet.title || rawPet.name || 'Companion',
    name: rawPet.name || 'Companion',
    species: rawPet.species || 'Dog',
    breed: rawPet.breed || 'Aspin',
    age: rawPet.age || '1 yr(s)',
    gender: rawPet.gender || 'Male',
    barangay: rawPet.barangay || 'Poblacion',
    controlNumber: rawPet.controlNumber || 'QR-PASSPORT',
    status: String(rawPet.status || 'AVAILABLE').toUpperCase(),
    ownerDisplayName: rawPet.ownerDisplayName || 'Pet Owner',
    verificationStatus: rawPet.verificationStatus || 'draft',
    housingRequirement: rawPet.housingRequirement || 'any',
    photoUrl:
      rawPet.photoUrl ||
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
    description:
      rawPet.description ||
      'Companion animal listed for peer-to-peer adoption in Iligan City.',
    healthClearance:
      rawPet.healthClearance || 'Responsible adopter required.',
    temperament: Array.isArray(rawPet.temperament) ? rawPet.temperament : [],
    vaccinations: Array.isArray(rawPet.vaccinations) ? rawPet.vaccinations : [],
  };

  // Apply to Adopt Modal State (`applyAdoption`)
  const [modalVisible, setModalVisible] = useState(false);
  const [adopterContact, setAdopterContact] = useState<string>(
    user?.contactNumber || ''
  );
  const [adoptionReason, setAdoptionReason] = useState<string>('');

  // Owner Photo Sharing Modal State (`updateListingPhotos`)
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(
    Boolean(rawPet.ownerAvatarUrl)
  );
  const [isUpdatingPhotos, setIsUpdatingPhotos] = useState(false);

  useEffect(() => {
    if (isOwnerOfListing) {
      fetchIncomingApplications();
    }
  }, [isOwnerOfListing, fetchIncomingApplications]);

  const listingApplications = incomingApplications.filter(
    (app) => String(app.listingId) === String(pet.listingId)
  );

  const handleSubmitApplication = async () => {
    const cleanPhone = adopterContact.trim();
    const phoneRegex = /^[+0-9 ()-]{7,40}$/;
    if (!phoneRegex.test(cleanPhone)) {
      Alert.alert(
        'Invalid Contact Number',
        'Please enter a valid contact number (7 to 40 digits, e.g., 09171234567).'
      );
      return;
    }

    if (!adoptionReason.trim()) {
      Alert.alert(
        'Reason Required',
        'Please share why you would like to adopt this pet and describe your home environment.'
      );
      return;
    }

    try {
      await submitApplication({
        listingId: pet.listingId,
        pet: pet.petId,
        contactNumber: cleanPhone,
        contact_number: cleanPhone,
        message: adoptionReason.trim(),
        reason_for_adoption: adoptionReason.trim(),
        address: `Brgy. ${user?.barangay || 'Poblacion'}, Iligan City`,
        status: 'PENDING',
      });

      setModalVisible(false);
      setAdoptionReason('');

      Alert.alert(
        'Application Sent to Pet Owner!',
        `Your application for ${pet.name} has been sent directly to ${pet.ownerDisplayName}. You can track their decision in your Profile > Adoptions tab.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert(
        'Application Failed',
        error?.message || 'Could not submit your adoption application.'
      );
    }
  };

  const handleUpdateListingPhotos = async () => {
    setIsUpdatingPhotos(true);
    try {
      await operate('updateListingPhotos', {
        listingId: pet.listingId,
        publishPetPhoto,
        publishOwnerPhoto,
      });
      await fetchAvailablePets();
      setPhotoModalVisible(false);
      Alert.alert(
        'Listing Photos Updated',
        'Your photo-sharing consent for this listing has been updated.'
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

  const handleToggleListing = async () => {
    try {
      await toggleListingVisibility(pet.listingId);
      Alert.alert(
        'Listing Visibility Updated',
        'Your listing visibility has been toggled.'
      );
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'Could not toggle listing visibility.'
      );
    }
  };

  const handleOwnerDecision = (
    appId: string,
    applicantName: string,
    decision: 'approve' | 'decline'
  ) => {
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
            try {
              await reviewApplication(appId, decision);
              Alert.alert('Updated', `Application ${decision}d.`);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Action failed.');
            }
          },
        },
      ]
    );
  };

  const handleOwnerConfirmTransfer = (appId: string, applicantName: string) => {
    Alert.alert(
      'Confirm Final Handover?',
      `Confirm that ${pet.name} has been physically handed over to ${applicantName}? Ownership of this pet, its QR passport, and medical records will automatically transfer to ${applicantName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          onPress: async () => {
            try {
              await confirmTransfer(appId);
              Alert.alert(
                'Transfer Complete!',
                `Ownership of ${pet.name} has been transferred to ${applicantName}.`
              );
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Transfer Failed', err?.message || 'Could not complete handover.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 110 + insets.bottom },
        ]}
      >
        <Image
          source={{ uri: pet.photoUrl }}
          style={styles.petImage}
          resizeMode="cover"
        />

        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{pet.title}</Text>
              <Text style={styles.petSubtitle}>
                {pet.breed} • {pet.species} • {pet.age} • {pet.gender} • Brgy.{' '}
                {pet.barangay}
              </Text>
              <Text style={styles.ownerSubText}>
                Listed by: {isOwnerOfListing ? 'You' : pet.ownerDisplayName}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{pet.status}</Text>
            </View>
          </View>

          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>
              {pet.verificationStatus === 'verified'
                ? '✓ CVO Verified Pet'
                : 'Personal QR Passport ID'}
            </Text>
            <Text style={styles.tokenValue}>{pet.controlNumber}</Text>
          </View>

          {/* Owner Controls if viewing own listing */}
          {isOwnerOfListing && (
            <View style={styles.ownerControlCard}>
              <Text style={styles.sectionTitle}>Manage My Listing</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.ownerBtn}
                  onPress={() => setPhotoModalVisible(true)}
                >
                  <Text style={styles.ownerBtnText}>
                    📷 Photo Consent Options
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ownerBtn, { borderColor: '#64748B' }]}
                  onPress={handleToggleListing}
                >
                  <Text style={[styles.ownerBtnText, { color: '#475569' }]}>
                    👁️ Hide / Restore Listing
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
                Received Applications ({listingApplications.length})
              </Text>
              {listingApplications.length === 0 ? (
                <Text style={styles.bodyText}>
                  No applications received for this listing yet.
                </Text>
              ) : (
                listingApplications.map((app) => {
                  const st = String(app.status || 'PENDING').toUpperCase();
                  return (
                    <View key={String(app.id)} style={styles.vacCard}>
                      <View style={styles.vacHeader}>
                        <Text style={styles.vacName}>{app.applicantName}</Text>
                        <Text style={styles.vacDate}>{st}</Text>
                      </View>
                      <Text style={styles.bodyText}>
                        📞 {app.contactNumber || app.contact_number}
                      </Text>
                      <CallButton phone={app.contactNumber || app.contact_number}/>
                      <Text style={styles.bodyText}>💬 {app.message}</Text>

                      {st === 'PENDING' && (
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.ownerBtn,
                              { borderColor: '#D9534F' },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                String(app.id),
                                app.applicantName || 'Applicant',
                                'decline'
                              )
                            }
                          >
                            <Text
                              style={{ color: '#D9534F', fontWeight: 'bold' }}
                            >
                              Decline
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.ownerBtn,
                              {
                                backgroundColor: '#16A34A',
                                borderColor: '#16A34A',
                              },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                String(app.id),
                                app.applicantName || 'Applicant',
                                'approve'
                              )
                            }
                          >
                            <Text
                              style={{ color: '#FFFFFF', fontWeight: 'bold' }}
                            >
                              Approve & Reserve
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {(st === 'APPROVED' || st === 'OWNER_APPROVED') && (
                        <TouchableOpacity
                          style={[
                            styles.applyBtn,
                            { backgroundColor: '#0284C7', marginTop: 10 },
                          ]}
                          onPress={() =>
                            handleOwnerConfirmTransfer(
                              String(app.id),
                              app.applicantName || 'Adopter'
                            )
                          }
                        >
                          <Text style={styles.applyBtnText}>
                            🤝 Confirm Final Handover
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Housing & Details</Text>
            <View style={styles.tagWrap}>
              {(pet.temperament || []).map((tag: string, idx: number) => (
                <View key={idx} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pet Story & Description</Text>
            <Text style={styles.bodyText}>{pet.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adopter Requirements</Text>
            <View style={styles.clearanceBanner}>
              <Text style={styles.clearanceText}>✓ {pet.healthClearance}</Text>
            </View>
          </View>

          {pet.vaccinations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Official Veterinary Records
              </Text>
              {pet.vaccinations.map((vac: any, index: number) => (
                <View key={index} style={styles.vacCard}>
                  <View style={styles.vacHeader}>
                    <Text style={styles.vacName}>{vac.vaccine}</Text>
                    <Text style={styles.vacDate}>{vac.dateAdministered}</Text>
                  </View>
                  <Text style={styles.vacVet}>
                    Recorded by: {vac.administeringVet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Adopt Button: Shown only for Pet Owners viewing someone else's AVAILABLE listing */}
      {!isOwnerOfListing && !isOfficer && pet.status === 'AVAILABLE' && (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
          ]}
        >
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.applyBtnText}>Apply to Adopt {pet.name}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal 1: Apply to Adopt (`applyAdoption`) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              Apply to Adopt {pet.name}
            </Text>
            <Text style={styles.modalSubheading}>
              Your application goes directly to {pet.ownerDisplayName} for
              review.
            </Text>

            <Text style={styles.fieldLabel}>
              Your Contact Number (Required) *
            </Text>
            <TextInput
              style={styles.textInput}
              value={adopterContact}
              onChangeText={setAdopterContact}
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.fieldLabel}>
              Reason for Adoption & Home Setup (Required) *
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { height: 100, textAlignVertical: 'top' },
              ]}
              value={adoptionReason}
              onChangeText={setAdoptionReason}
              placeholder="Tell the owner about your experience with pets, housing type, and why you'd love to adopt..."
              placeholderTextColor="#94A3B8"
              multiline
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
                disabled={isLoading}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSubmitApplication}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitModalBtnText}>
                    Submit Application
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Update Listing Photo Consent (`updateListingPhotos`) */}
      <Modal
        visible={photoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Listing Photo Sharing</Text>
            <View style={styles.switchRow}>
              <Text style={styles.bodyText}>Publish Pet Photo on Listing</Text>
              <Switch
                value={publishPetPhoto}
                onValueChange={setPublishPetPhoto}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.bodyText}>
                Publish My Profile Avatar on Listing
              </Text>
              <Switch
                value={publishOwnerPhoto}
                onValueChange={setPublishOwnerPhoto}
              />
            </View>
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
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
  petImage: { width: '100%', height: 240 },
  cardContent: { padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  petName: { fontSize: 22, fontWeight: 'bold', color: '#1E293B' },
  petSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  ownerSubText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: { color: '#166534', fontSize: 11, fontWeight: 'bold' },
  tokenBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#E0F2FE',
    padding: 10,
    borderRadius: 8,
    marginVertical: 12,
  },
  tokenLabel: { fontSize: 12, fontWeight: '600', color: '#0369A1' },
  tokenValue: { fontSize: 12, fontWeight: 'bold', color: '#0284C7' },
  ownerControlCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  ownerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  ownerBtnText: { color: '#0284C7', fontSize: 12, fontWeight: 'bold' },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  clearanceBanner: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    padding: 10,
    borderRadius: 4,
  },
  clearanceText: { color: '#15803D', fontSize: 13, fontWeight: '600' },
  vacCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  vacHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vacName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  vacDate: { fontSize: 11, color: '#0284C7', fontWeight: 'bold' },
  vacVet: { fontSize: 11, color: '#94A3B8' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  applyBtn: {
    backgroundColor: '#00AEEF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
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
  modalHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalSubheading: { fontSize: 12, color: '#64748B', marginBottom: 12 },
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelModalBtnText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  submitModalBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitModalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
});
```

## File: src/screens/Auth/LoginScreen.tsx
```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useAuthStore } from '../../store';
import { account, PUBLIC_PASSPORT_BASE_URL } from '../../api/client';

export default function LoginScreen({ navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Forgot Password Modal State
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const { login, isLoading } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(
        'Missing Fields',
        'Please enter both your email address and password.'
      );
      return;
    }

    await login({ email: email.trim().toLowerCase(), password });
  };

  const handlePasswordRecovery = async () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Email Required', 'Please enter your registered email.');
      return;
    }

    setIsSendingReset(true);
    try {
      const recoveryRedirect = `${PUBLIC_PASSPORT_BASE_URL.replace(
        /\/+$/,
        ''
      )}/login.html`;
      await account.createRecovery(cleanEmail, recoveryRedirect);
      setResetModalVisible(false);
      setResetEmail('');
      Alert.alert(
        'Recovery Link Sent',
        'If an account matches that email, a password recovery link has been dispatched.'
      );
    } catch (error: any) {
      Alert.alert(
        'Recovery Notice',
        error?.message ||
          'Unable to initiate password recovery at this moment.'
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.formContainer}>
        <View style={styles.badgePill}>
          <Text style={styles.badgePillText}>ILIGAN CITY VETERINARY OFFICE</Text>
        </View>
        <Text style={styles.headerTitle}>City Vet Hub</Text>
        <Text style={styles.subHeader}>
          Pet Owner & Field Officer Mobile Portal
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email address"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.forgotBtn}
          onPress={() => {
            setResetEmail(email);
            setResetModalVisible(true);
          }}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>Register here</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Password Recovery Modal */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSub}>
              Enter the email linked to your CityVetHub account to receive a
              recovery link.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#94A3B8"
              value={resetEmail}
              onChangeText={setResetEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setResetModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handlePasswordRecovery}
                disabled={isSendingReset}
              >
                {isSendingReset ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  badgePill: {
    alignSelf: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284C7',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 6,
  },
  subHeader: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: { marginBottom: 16 },
  label: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  forgotText: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#00AEEF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: { color: '#64748B', fontSize: 14 },
  registerLink: { color: '#00AEEF', fontSize: 14, fontWeight: 'bold' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
```

## File: src/screens/Auth/RegisterScreen.tsx
```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
} from '../../store/types/constants';
import { authApi } from '../../api/auth';

export default function RegisterScreen({ navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const [requestedRole, setRequestedRole] = useState<'owner' | 'officer'>(
    'owner'
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [barangay, setBarangay] = useState<IliganBarangay>('Hinaplanon');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Field Officer optional metadata
  const [position, setPosition] = useState('Field Officer');
  const [employeeId, setEmployeeId] = useState('');

  const [consentChecked, setConsentChecked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password || !contactNumber.trim()) {
      Alert.alert(
        'Missing Fields',
        'Please complete your Full Name, Email, Contact Number, and Password.'
      );
      return;
    }

    if (password.length < 12) {
      Alert.alert(
        'Password Policy',
        'For account security, your password must be at least 12 characters long (matching the CityVetHub web requirement).'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Your passwords do not match.');
      return;
    }

    if (!consentChecked) {
      Alert.alert(
        'Data Privacy Consent',
        'Please agree to the Data Privacy Act of 2012 terms to register.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authApi.registerAccount({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: contactNumber.trim(),
        address: address.trim() || `Brgy. ${barangay}, Iligan City`,
        barangay,
        requestedRole,
        position: requestedRole === 'officer' ? position : undefined,
        employeeId: requestedRole === 'officer' ? employeeId : undefined,
        assignedArea: requestedRole === 'officer' ? barangay : undefined,
      });

      if (result.pendingOfficer) {
        Alert.alert(
          'Awaiting CVO Approval',
          'Your Field Officer account has been registered and placed in the pending approval queue (`blockPendingOfficer`).\n\nYou will be able to sign in once a CVO Administrator approves your membership on the Web Dashboard.',
          [{ text: 'Back to Login', onPress: () => navigation.navigate('Login') }]
        );
      } else {
        Alert.alert(
          'Registration Complete',
          'Your Pet Owner account has been created. Please sign in.',
          [{ text: 'Sign In', onPress: () => navigation.navigate('Login') }]
        );
      }
    } catch (error: any) {
      console.error('Appwrite Registration Error:', error);
      Alert.alert(
        'Registration Failed',
        error?.message || 'Could not create your account. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Create Account</Text>
        <Text style={styles.subHeader}>
          Select your role in the Iligan City Vet Hub Ecosystem
        </Text>

        {/* Role Selector */}
        <View style={styles.roleSwitchRow}>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'owner' && styles.roleTabActive,
            ]}
            onPress={() => setRequestedRole('owner')}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'owner' && styles.roleTabTextActive,
              ]}
            >
              🐾 Pet Owner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'officer' && styles.roleTabActive,
            ]}
            onPress={() => setRequestedRole('officer')}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'officer' && styles.roleTabTextActive,
              ]}
            >
              🛡️ Field Officer / Vet
            </Text>
          </TouchableOpacity>
        </View>

        {requestedRole === 'officer' && (
          <View style={styles.officerNoticeBanner}>
            <Text style={styles.officerNoticeText}>
              Note: Field Officer registrations require CVO Administrator
              approval before login access is activated.
            </Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Juan Dela Cruz"
            placeholderTextColor="#94A3B8"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="juan@example.com"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Mobile / Contact Number</Text>
          <TextInput
            style={styles.input}
            placeholder="0917 123 4567"
            placeholderTextColor="#94A3B8"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            {requestedRole === 'officer'
              ? 'Assigned Barangay (Iligan City)'
              : 'Home Barangay (Iligan City)'}
          </Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={barangay}
              onValueChange={(val) => setBarangay(val as IliganBarangay)}
              style={{ color: '#1E293B', width: '100%' }}
            >
              {ILIGAN_BARANGAYS.map((brgy) => (
                <Picker.Item key={brgy} label={brgy} value={brgy} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Street / Purok Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Purok 3, Hinaplanon, Iligan City"
            placeholderTextColor="#94A3B8"
            value={address}
            onChangeText={setAddress}
          />
        </View>

        {requestedRole === 'officer' && (
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>Position / Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Field Inspector"
                placeholderTextColor="#94A3B8"
                value={position}
                onChangeText={setPosition}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>Employee / PRC ID</Text>
              <TextInput
                style={styles.input}
                placeholder="CVO-2026-01"
                placeholderTextColor="#94A3B8"
                value={employeeId}
                onChangeText={setEmployeeId}
              />
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password (12+ characters)</Text>
          <TextInput
            style={styles.input}
            placeholder="Create a strong password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor="#94A3B8"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setConsentChecked(!consentChecked)}
        >
          <View
            style={[styles.checkbox, consentChecked && styles.checkboxActive]}
          >
            {consentChecked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            I consent to the processing of my account data in accordance with
            RA 10173 (Data Privacy Act of 2012) and Iligan CVO guidelines.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerButton}
          onPress={handleRegister}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.registerButtonText}>
              {requestedRole === 'officer'
                ? 'Submit Officer Application'
                : 'Create Pet Owner Account'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  roleSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  roleTabActive: {
    backgroundColor: '#FFFFFF',
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  roleTabTextActive: {
    color: '#0284C7',
    fontWeight: 'bold',
  },
  officerNoticeBanner: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  officerNoticeText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputContainer: { marginBottom: 14 },
  halfInput: { width: '48%' },
  label: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1E293B',
  },
  pickerWrapper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 50,
    justifyContent: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#00AEEF',
    borderColor: '#00AEEF',
  },
  checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  registerButton: {
    backgroundColor: '#00AEEF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: { color: '#64748B', fontSize: 14 },
  loginLink: { color: '#00AEEF', fontSize: 14, fontWeight: 'bold' },
});
```

## File: src/screens/Community/CommunityScreen.tsx
```typescript
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { operate, uploadMediaFile } from '../../api/client';
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

// Sub-component that resolves a 5-minute signed URL from `communityImageToken`
function SignedCommunityImage({
  postId,
  fileId,
}: {
  postId: string;
  fileId: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    operate<{ url?: string }>('communityImageToken', { postId, fileId })
      .then((res) => {
        if (mounted && res?.url) {
          setSignedUrl(res.url);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [postId, fileId]);

  if (!signedUrl) {
    return (
      <View style={styles.imageTokenPlaceholder}>
        <ActivityIndicator size="small" color="#00AEEF" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={styles.postAttachedImage}
      resizeMode="cover"
    />
  );
}

export default function CommunityScreen() {
  const styles = useThemedStyles(baseStyles);
  const { user } = useAuthStore();
  const isVerifiedOwner = user?.accountVerificationStatus === 'verified';

  const [activeTab, setActiveTab] = useState<
    'feed' | 'channels' | 'notices'
  >('feed');
  const [isLoading, setIsLoading] = useState(false);

  // Overview state
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [notices, setNotices] = useState<CommunityNotice[]>([]);
  const [selectedChannel, setSelectedChannel] =
    useState<CommunityChannel | null>(null);
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

  const loadChannelPosts = useCallback(async (channel: CommunityChannel) => {
    setSelectedChannel(channel);
    if (!channel.canRead && channel.privacy === 'private') {
      setChannelPosts([]);
      return;
    }
    try {
      const res = await operate<{
        channel?: CommunityChannel;
        posts?: CommunityPost[];
      }>('communityChannel', { channelId: channel.id });
      setChannelPosts(Array.isArray(res?.posts) ? res.posts : []);
    } catch (error) {
      console.warn('communityChannel warning:', error);
      setChannelPosts([]);
    }
  }, []);

  const fetchCommunityData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [overviewRes, noticesRes] = await Promise.all([
        operate<CommunityOverview>('communityOverview', {}),
        operate<{ notices?: CommunityNotice[] }>('communityOfficialNotices', {}).catch(
          () => ({ notices: [] })
        ),
      ]);

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

      if (selectedChannel) {
        const updated = fetchedChannels.find(
          (c) => c.id === selectedChannel.id
        );
        if (updated) {
          await loadChannelPosts(updated);
        }
      } else {
        const firstReadable = fetchedChannels.find(
          (c) => c.privacy === 'public' || c.canRead
        );
        if (firstReadable) {
          await loadChannelPosts(firstReadable);
        }
      }
    } catch (error) {
      console.warn('communityOverview error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedChannel, loadChannelPosts]);

  useEffect(() => {
    fetchCommunityData();
  }, []);

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
      setSearchPosts(Array.isArray(res?.posts) ? res.posts : []);
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        'Only CVO-Verified Pet Owners can publish posts.'
      );
      return;
    }
    if (!selectedChannel) {
      Alert.alert('Select a Channel', 'Please choose a channel first.');
      return;
    }
    if (!postTitle.trim() || !postBody.trim()) {
      Alert.alert('Missing Fields', 'Please enter a post title and message.');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedIds: string[] = [];
      for (const asset of postImages) {
        const fid = await uploadMediaFile(asset);
        uploadedIds.push(fid);
      }

      await operate('communityCreatePost', {
        channelId: selectedChannel.id,
        title: postTitle.trim(),
        body: postBody.trim(),
        imageFileIds: uploadedIds,
      });

      setIsCreatePostVisible(false);
      setPostTitle('');
      setPostBody('');
      setPostImages([]);
      await loadChannelPosts(selectedChannel);
    } catch (error: any) {
      Alert.alert('Post Failed', error?.message || 'Could not publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert('Delete Post?', 'Soft-delete your discussion post?', [
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
      setComments(Array.isArray(res?.comments) ? res.comments : []);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!isVerifiedOwner) {
      Alert.alert(
        'Verified Owner Only',
        'Only CVO-Verified Pet Owners can comment.'
      );
      return;
    }
    if (!activePostForComments || !newCommentBody.trim()) return;

    setIsSubmitting(true);
    try {
      await operate('communityCreateComment', {
        postId: activePostForComments.id,
        body: newCommentBody.trim(),
        ...(replyToCommentId ? { parentCommentId: replyToCommentId } : {}),
      });
      setNewCommentBody('');
      setReplyToCommentId('');
      await openCommentsModal(activePostForComments);
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
                  {isVerifiedOwner && selectedChannel.canRead && (
                    <TouchableOpacity
                      style={styles.newPostBtn}
                      onPress={() => setIsCreatePostVisible(true)}
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
                return (
                  <View key={post.id} style={styles.postCard}>
                    <View style={styles.postHeader}>
                      <Text style={styles.postAuthor}>
                        👤 {post.authorName} •{' '}
                        {new Date(post.createdAt).toLocaleDateString()}
                      </Text>
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
                    {Array.isArray(post.imageFileIds) &&
                      post.imageFileIds.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginVertical: 10 }}
                        >
                          {post.imageFileIds.map((fid) => (
                            <SignedCommunityImage
                              key={fid}
                              postId={post.id}
                              fileId={fid}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Community Channel</Text>
            <Text style={styles.fieldLabel}>Channel Name (1–80 chars) *</Text>
            <TextInput
              style={styles.input}
              maxLength={80}
              value={newChannelName}
              onChangeText={setNewChannelName}
              placeholder="e.g. Iligan Cat Owners Club"
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
                      newChannelPrivacy === p && styles.privacyChoiceTextActive,
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
          </View>
        </View>
      </Modal>

      {/* Modal 2: Create Post (`communityCreatePost` with up to 4 images) */}
      <Modal
        visible={isCreatePostVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCreatePostVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Post in #{selectedChannel?.name}
            </Text>
            <Text style={styles.fieldLabel}>Title (1–140 chars) *</Text>
            <TextInput
              style={styles.input}
              maxLength={140}
              value={postTitle}
              onChangeText={setPostTitle}
              placeholder="Discussion title..."
            />
            <Text style={styles.fieldLabel}>Body (1–5000 chars) *</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              maxLength={5000}
              multiline
              value={postBody}
              onChangeText={setPostBody}
              placeholder="Write your discussion..."
            />
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handlePickPostImage}
            >
              <Text style={styles.attachBtnText}>
                📷 Attach Private Image ({postImages.length}/4 selected)
              </Text>
            </TouchableOpacity>

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
          </View>
        </View>
      </Modal>

      {/* Modal 3: Threaded Comments & Replies (`communityComments`) */}
      <Modal
        visible={!!activePostForComments}
        animationType="slide"
        transparent
        onRequestClose={() => setActivePostForComments(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>
              Comments: {activePostForComments?.title}
            </Text>

            <ScrollView style={{ maxHeight: 340, marginVertical: 10 }}>
              {loadingComments ? (
                <ActivityIndicator color="#00AEEF" />
              ) : comments.length === 0 ? (
                <Text style={styles.emptySub}>No comments yet.</Text>
              ) : (
                comments.map((c) => {
                  const isMyComment =
                    user?.id && String(c.authorId) === String(user.id);
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.commentItem,
                        c.parentCommentId ? { marginLeft: 18 } : null,
                      ]}
                    >
                      <View style={styles.postHeader}>
                        <Text style={styles.postAuthor}>
                          {c.authorName} •{' '}
                          {new Date(c.createdAt).toLocaleDateString()}
                        </Text>
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
        </View>
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
                  <View
                    style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}
                  >
                    <TouchableOpacity
                      style={[styles.cancelBtn, { borderColor: '#D9534F' }]}
                      onPress={() => handleReviewJoinRequest(req.id, 'rejected')}
                    >
                      <Text style={{ color: '#D9534F', fontWeight: 'bold' }}>
                        Reject
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        { backgroundColor: '#16A34A' },
                      ]}
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
  scrollContent: { padding: 14, paddingBottom: 36 },
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
    marginBottom: 6,
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
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  postAttachedImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
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
```

## File: src/screens/Officer/FieldIncidentScreen.tsx
```typescript
import FullscreenMap from '../../components/FullscreenMap';
import * as ImagePicker from 'expo-image-picker';
import { Image, Linking } from 'react-native';
import { uploadMediaFile } from '../../api/client';
import { getStaffIncidentDetails, requirePhase422Backend, StaffIncidentDetails } from '../../api/phase422';
import { useThemedStyles } from '../../theme';
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  getBarangayCoords,
  findNearestBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import { useSurveillanceStore } from '../../store';
import { IncidentReportRow } from '../../store/types/surveillance';

// Contract Section 09.F Barangay Report-Color Rule: 1-2 GREEN; 3-10 YELLOW; 11+ RED; 0 NEUTRAL
const getVolumeColor = (count: number) => {
  if (count >= 11)
    return { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B', hex: '#EF4444', label: '11+ Reports (High Volume)' };
  if (count >= 3)
    return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', hex: '#F59E0B', label: '3–10 Reports (Moderate)' };
  if (count >= 1)
    return { bg: '#DCFCE7', border: '#22C55E', text: '#166534', hex: '#22C55E', label: '1–2 Reports (Low Volume)' };
  return { bg: '#F1F5F9', border: '#CBD5E1', text: '#64748B', hex: '#94A3B8', label: '0 Reports' };
};

export default function FieldIncidentScreen() {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const {
    staffReports,
    incidentCategories,
    fetchStaffReports,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);

  // Field Officer Report Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] =
    useState<IliganBarangay>('Poblacion');
  const [pinLat, setPinLat] = useState<number>(8.2285);
  const [pinLng, setPinLng] = useState<number>(124.2375);
  const [notes, setNotes] = useState('');
  const [evidencePhoto, setEvidencePhoto] = useState<ImagePicker.ImagePickerAsset|null>(null);
  const [selectedReport, setSelectedReport] = useState<StaffIncidentDetails|null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetchStaffReports();
    fetchIncidentCategories();
  }, [fetchStaffReports, fetchIncidentCategories]);

  useEffect(() => {
    if (incidentCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(incidentCategories[0].name);
    }
  }, [incidentCategories, selectedCategory]);

  const filteredReports = useMemo(() => {
    return staffReports.filter((r) => {
      if (categoryFilter === 'ALL') return true;
      return (
        String(r.diseaseType || '').toLowerCase() ===
        categoryFilter.toLowerCase()
      );
    });
  }, [staffReports, categoryFilter]);

  // Group reports by canonical barangay
  const barangayGroups = useMemo(() => {
    const map = new Map<string, IncidentReportRow[]>();
    filteredReports.forEach((rep) => {
      const brgy = normalizeBarangay(rep.barangay);
      const list = map.get(brgy) || [];
      list.push(rep);
      map.set(brgy, list);
    });

    return Array.from(map.entries())
      .map(([barangay, reports]) => ({
        barangay,
        count: reports.length,
        reports,
        coords: getBarangayCoords(barangay),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const openReportDetails = async (reportId:string) => {
    setReportError('');setSelectedReport(null);setReportLoading(true);
    try {const report = await getStaffIncidentDetails(reportId);setSelectedReport(report);}
    catch(e:any){setReportError(e?.message || 'Unable to retrieve report details.');}
    finally{setReportLoading(false);}
  };
  const pickEvidence = async () => {
    try {const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.8});
      if(result.canceled||!result.assets?.[0])return;
      if(result.assets[0].fileSize && result.assets[0].fileSize! > 5_000_000)throw new Error('Maximum 5 MB per photo.');
      setEvidencePhoto(result.assets[0]);
    }catch(e:any){Alert.alert('Image unavailable',e?.message || 'Try another image.');}
  };
  const handleSubmitOfficerReport = async () => {
    if (!selectedCategory) {
      Alert.alert('Category Required', 'Select an active incident category.');
      return;
    }

    try {
      await requirePhase422Backend();
      const photoFileId = evidencePhoto ? await uploadMediaFile(evidencePhoto) : '';
      await reportIncident({
        disease: selectedCategory,
        barangay: selectedBarangay,
        lat: pinLat,
        lng: pinLng,
        description: notes.trim(),
        photoFileId,
      });

      setIsModalVisible(false);
      setNotes('');
      setEvidencePhoto(null);
      await fetchStaffReports();
      Alert.alert(
        'Field Incident Recorded',
        `Incident logged in Brgy. ${selectedBarangay} (${pinLat.toFixed(
          4
        )}, ${pinLng.toFixed(4)}).`
      );
    } catch (error: any) {
      Alert.alert(
        'Submission Failed',
        error?.message || 'Could not submit field incident.'
      );
    }
  };

  const surveillanceMapHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }</style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([8.2280, 124.2452], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var groups = ${JSON.stringify(
            barangayGroups.map((g) => ({
              barangay: g.barangay,
              count: g.count,
              lat: g.coords.latitude,
              lng: g.coords.longitude,
              color: getVolumeColor(g.count).hex,
            }))
          )};

          groups.forEach(function(g) {
            var circle = L.circleMarker([g.lat, g.lng], {
              radius: Math.min(22, 8 + g.count * 1.5),
              fillColor: g.color,
              color: '#FFFFFF',
              weight: 2,
              fillOpacity: 0.85
            }).addTo(map);
            circle.bindPopup('<b>Brgy. ' + g.barangay + '</b><br>Submitted Reports: ' + g.count + '<br><i>Report volume only (not clinical diagnosis)</i>');
          });

          map.on('click', function(e) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                lat: e.latlng.lat,
                lng: e.latlng.lng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Barangay Incident Surveillance
          </Text>
          <Text style={styles.headerSub}>
            Volume Rule: 1–2 Green • 3–10 Yellow • 11+ Red ({filteredReports.length}{' '}
            reports)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newReportBtn}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.newReportBtnText}>+ Log Incident</Text>
        </TouchableOpacity>
      </View>

      <View style={{ alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 8 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => setFullscreen(true)}
          style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#3478F6', borderRadius: 10 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>⛶ Fullscreen surveillance map</Text>
        </TouchableOpacity>
      </View>
      <FullscreenMap visible={fullscreen} onClose={() => setFullscreen(false)} html={surveillanceMapHTML}
        title="Field surveillance · Iligan City" onPick={(latitude, longitude) => {
          setPinLat(latitude); setPinLng(longitude);
          setSelectedBarangay(findNearestBarangay(latitude, longitude));
          setFullscreen(false); setIsModalVisible(true);
        }}/>
      {/* Interactive Barangay Volume Map */}
      <View style={styles.mapBox}>
        <WebView
          key={`${categoryFilter}-${filteredReports.length}`}
          originWhitelist={['*']}
          source={{ html: surveillanceMapHTML }}
          style={{ flex: 1 }}
          javaScriptEnabled
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (typeof data.lat === 'number' && typeof data.lng === 'number') {
                const nearest = findNearestBarangay(data.lat, data.lng);
                setPinLat(data.lat);
                setPinLng(data.lng);
                setSelectedBarangay(nearest);
                setIsModalVisible(true);
              }
            } catch {
              // Ignore
            }
          }}
        />
      </View>

      {/* Category Filter */}
      <View style={styles.filterBar}>
        <Picker
          selectedValue={categoryFilter}
          onValueChange={(v) => setCategoryFilter(String(v))}
          style={{ color: '#1E293B', width: '100%' }}
        >
          <Picker.Item
            label={`All Incident Categories (${staffReports.length})`}
            value="ALL"
          />
          {incidentCategories.map((c) => (
            <Picker.Item key={c.$id} label={c.name} value={c.name} />
          ))}
        </Picker>
      </View>

      {/* Grouped Barangay List with Expandable Coordinates */}
      <FlatList
        data={barangayGroups}
        keyExtractor={(item) => item.barangay}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchStaffReports}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Submitted Incident Reports</Text>
            <Text style={styles.emptySub}>
              Tap the map or "+ Log Incident" to submit a field report.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const vol = getVolumeColor(item.count);
          const isExpanded = expandedBarangay === item.barangay;

          return (
            <TouchableOpacity
              style={[styles.groupCard, { borderLeftColor: vol.border }]}
              activeOpacity={0.85}
              onPress={() =>
                setExpandedBarangay(isExpanded ? null : item.barangay)
              }
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.brgyTitle}>Brgy. {item.barangay}</Text>
                  <Text style={styles.volumeLabel}>{vol.label}</Text>
                </View>
                <View style={[styles.countBadge, { backgroundColor: vol.bg }]}>
                  <Text style={[styles.countText, { color: vol.text }]}>
                    {item.count} Report{item.count > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              {isExpanded && (
                <View style={styles.expandedList}>
                  {item.reports.map((rep) => (
                    <TouchableOpacity key={rep.$id} style={styles.reportRow} accessibilityRole="button" onPress={()=>openReportDetails(rep.$id)}>
                      <View style={styles.reportTopRow}>
                        <Text style={styles.reportCat}>{rep.diseaseType}</Text>
                        <Text style={styles.reportRole}>
                          Role: {rep.reporterRole || 'owner'}
                        </Text>
                      </View>
                      <Text style={styles.reportCoords}>
                        Coordinates: {Number(rep.latitude).toFixed(5)},{' '}
                        {Number(rep.longitude).toFixed(5)}
                      </Text>
                      {rep.description ? (
                        <Text style={styles.reportDesc}>{rep.description}</Text>
                      ) : null}
                      <Text style={styles.reportDate}>
                        Logged:{' '}
                        {new Date(
                          rep.reportedAt || rep.$createdAt || Date.now()
                        ).toLocaleString()}
                      </Text>
                      <Text style={{color:'#2563EB',fontWeight:'700',marginTop:5}}>View full report details ›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Staff-only detail modal: data is obtained through an authorized Function call. */}
      <Modal visible={reportLoading || !!selectedReport || !!reportError} transparent animationType="fade" onRequestClose={()=>{setSelectedReport(null);setReportError('');setReportLoading(false);}}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard,{maxHeight:'85%',borderRadius:22}]}>
            <ScrollView>
              <Text style={styles.modalTitle}>Incident report details</Text>
              {reportLoading ? <ActivityIndicator size="large" color="#1763AA"/> : null}
              {reportError ? <Text style={{color:'#B91C1C',paddingVertical:12}}>{reportError}</Text> : null}
              {selectedReport ? <>
                <Text style={{fontWeight:'800',fontSize:18,marginTop:10}}>{selectedReport.diseaseType}</Text>
                <Text style={{color:'#475569',marginVertical:8}}>Reported by {selectedReport.reporterName} ({selectedReport.reporterRole||'staff'})</Text>
                <Text style={{color:'#475569'}}>Barangay: {selectedReport.barangay}  ·  Status: {selectedReport.status||'pending'}</Text>
                <Text style={{color:'#475569',marginTop:5}}>Reported: {new Date(selectedReport.reportedAt||Date.now()).toLocaleString()}</Text>
                <Text style={{color:'#334155',marginVertical:12}}>{selectedReport.description||'No additional notes provided.'}</Text>
                {selectedReport.photoUrl ? <Image source={{uri:selectedReport.photoUrl}} style={{height:220,borderRadius:14,marginBottom:10}} resizeMode="contain"/> : <Text style={{color:'#64748B',marginBottom:10}}>No photo attached.</Text>}
                <Text style={{color:'#475569'}}>Coordinates: {Number(selectedReport.latitude).toFixed(5)}, {Number(selectedReport.longitude).toFixed(5)}</Text>
                <TouchableOpacity accessibilityRole="link" onPress={()=>Linking.openURL(`https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(selectedReport.latitude))}&mlon=${encodeURIComponent(String(selectedReport.longitude))}#map=17/${selectedReport.latitude}/${selectedReport.longitude}`).catch(()=>Alert.alert('Map unavailable','Could not open the map application.'))}>
                  <Text style={{color:'#1D4ED8',fontWeight:'700',marginVertical:12}}>View location in OpenStreetMap ↗</Text>
                </TouchableOpacity>
              </>:null}
            </ScrollView>
            <TouchableOpacity accessibilityRole="button" onPress={()=>{setSelectedReport(null);setReportError('');setReportLoading(false);}} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Modal: Submit Field Incident (`submitDisease`) */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Submit Field Incident</Text>
              <Text style={styles.modalSub}>
                Pinned Coords: {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
              </Text>

              <Text style={styles.label}>Active Incident Category *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={selectedCategory}
                  onValueChange={(v) => setSelectedCategory(String(v))}
                >
                  {incidentCategories.map((c) => (
                    <Picker.Item key={c.$id} label={c.name} value={c.name} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Barangay (Iligan City) *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={selectedBarangay}
                  onValueChange={(val) => {
                    const brgy = val as IliganBarangay;
                    setSelectedBarangay(brgy);
                    const c = getBarangayCoords(brgy);
                    setPinLat(c.latitude);
                    setPinLng(c.longitude);
                  }}
                >
                  {ILIGAN_BARANGAYS.map((brgy) => (
                    <Picker.Item key={brgy} label={brgy} value={brgy} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Field Notes (Optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Enter field observations..."
                placeholderTextColor="#94A3B8"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <Text style={styles.label}>Evidence photo (optional; max 5 MB)</Text>
              <TouchableOpacity accessibilityRole="button" onPress={pickEvidence} style={styles.pickerBox}>
                <Text style={{color:'#1763AA',padding:12}}>{evidencePhoto ? `✓ ${evidencePhoto.fileName||'Photo selected'}` : '+ Attach evidence photo'}</Text>
              </TouchableOpacity>
              {evidencePhoto ? <><Image source={{uri:evidencePhoto.uri}} style={{height:125,borderRadius:10}}/>
                <TouchableOpacity onPress={()=>setEvidencePhoto(null)}><Text style={{color:'#B91C1C'}}>Remove photo</Text></TouchableOpacity></> : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleSubmitOfficerReport}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  headerSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  newReportBtn: {
    backgroundColor: '#D9534F',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newReportBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  mapBox: { height: 320, width: '100%' },
  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    height: 48,
    justifyContent: 'center',
  },
  listContent: { padding: 14, paddingBottom: 32 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  emptySub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brgyTitle: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  volumeLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: 'bold' },
  expandedList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  reportRow: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  reportCat: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  reportRole: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  reportCoords: { fontSize: 11, color: '#475569', fontWeight: '600' },
  reportDesc: { fontSize: 12, color: '#334155', marginTop: 4 },
  reportDate: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
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
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  modalSub: { fontSize: 12, color: '#0284C7', marginBottom: 10 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 6,
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
    backgroundColor: '#D9534F',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});
```

## File: src/screens/Officer/FieldLookupScreen.tsx
```typescript
import CallButton from '../../components/CallButton';
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
        'Official clinical/vaccination records can only be added to CVO-verified pets (`pets.$id`). Ask the owner to request CVO verification and have an administrator approve it first.'
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
        'Official Record Saved',
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
        <View>
          <Text style={styles.headerTitle}>CVO Field Registry & QR Lookup</Text>
          <Text style={styles.headerSubtitle}>
            Officer: {user?.fullName} • Area: Brgy.{' '}
            {user?.assignedArea || user?.barangay}
          </Text>
        </View>
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
              Supports both personal QR passports (`pet_passports`) and CVO
              verified records (`pets` with Official Registry ID).
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
                No verified pets found in `pets` table yet.
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
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
        </View>
      </Modal>

      {/* Modal 2: Add Official Medical Record (`addMedical`) */}
      <Modal
        visible={isMedModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsMedModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Record Official Vaccination / Treatment
            </Text>
            <Text style={styles.modalSub}>
              Patient: {searchedPet?.petName} (
              {searchedPet?.officialRegistryId || searchedPet?.$id})
            </Text>

            <Text style={styles.fieldLabel}>
              Record Type (Contract: Vaccination | Treatment)
            </Text>
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

            <Text style={styles.fieldLabel}>Clinical Notes / Batch Number</Text>
            <TextInput
              style={[
                styles.modalInput,
                { height: 70, textAlignVertical: 'top' },
              ]}
              value={medDescription}
              onChangeText={setMedDescription}
              multiline
            />

            <View style={styles.modalActionRow}>
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
                  <Text style={styles.submitBtnText}>Save Official Entry</Text>
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
```

## File: src/screens/Officer/OcularQueueScreen.tsx
```typescript
import { useThemedStyles } from '../../theme';
import React, { useEffect, useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { operate } from '../../api/client';
import { authApi } from '../../api/auth';
import { useAuthStore, useSurveillanceStore } from '../../store';
import { CommunityNotice } from '../../store/types/adoption';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  normalizeBarangay,
} from '../../store/types/constants';

export default function OcularQueueScreen() {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { user, refreshSession, logout } = useAuthStore();
  const { activeAlerts, fetchDiseaseAlerts } = useSurveillanceStore();

  const [activeTab, setActiveTab] = useState<'alerts' | 'profile'>('alerts');
  const [staffNotices, setStaffNotices] = useState<CommunityNotice[]>([]);
  const [severityFilter, setSeverityFilter] = useState<
    'ALL' | 'high' | 'medium' | 'low'
  >('ALL');
  const [isLoading, setIsLoading] = useState(false);

  // Officer Profile Form State (`saveProfile`)
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.contactNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [barangay, setBarangay] = useState<IliganBarangay>(
    normalizeBarangay(user?.barangay)
  );
  const [position, setPosition] = useState(user?.position || 'Field Officer');
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [assignedArea, setAssignedArea] = useState<IliganBarangay>(
    normalizeBarangay(user?.assignedArea || user?.barangay)
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const loadStaffAlertsAndNotices = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchDiseaseAlerts();
      const res = await operate<{ notices?: CommunityNotice[] }>(
        'communityOfficialNotices',
        {}
      ).catch(() => ({ notices: [] }));
      setStaffNotices(Array.isArray(res?.notices) ? res.notices : []);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDiseaseAlerts]);

  useEffect(() => {
    loadStaffAlertsAndNotices();
  }, [loadStaffAlertsAndNotices]);

  // Combine `disease_alerts` with officer-targeted `communityOfficialNotices`
  const combinedFeed = [
    ...activeAlerts.map((a) => ({
      id: `alert-${a.id}`,
      title: a.title,
      body: a.description,
      category: a.isOutbreak ? 'OUTBREAK DECLARATION' : 'STAFF ADVISORY',
      severity: String(a.severity || 'medium').toLowerCase(),
      barangay: String(a.barangay || 'Iligan City'),
      date: a.created_at || new Date().toISOString(),
    })),
    ...staffNotices.map((n) => ({
      id: `notice-${n.id}`,
      title: n.title,
      body: n.body,
      category: `CVO ${String(n.category || 'ANNOUNCEMENT').toUpperCase()}`,
      severity: String(n.priority || 'info').toLowerCase(),
      barangay: n.barangay || 'All Barangays',
      date: n.date || new Date().toISOString(),
    })),
  ].filter((item) => {
    if (severityFilter === 'ALL') return true;
    return item.severity === severityFilter;
  });

  const handleSaveOfficerProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Full Name cannot be empty.');
      return;
    }
    setIsSavingProfile(true);
    try {
      await authApi.saveProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        barangay,
        position: position.trim(),
        employeeId: employeeId.trim(),
        assignedArea,
      });
      await refreshSession();
      Alert.alert(
        'Officer Profile Saved',
        'Your Field Officer profile has been updated.'
      );
    } catch (error: any) {
      Alert.alert(
        'Save Failed',
        error?.message || 'Could not update officer profile.'
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUploadOfficerAvatar = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setIsSavingProfile(true);
      await authApi.uploadAndSaveAvatar(res.assets[0]);
      await refreshSession();
      Alert.alert('Avatar Updated', 'Your Field Officer profile picture has been saved.');
    } catch (error: any) {
      Alert.alert('Photo upload failed', error?.message || 'Choose a JPG or PNG under 5 MB and try again.');
    } finally { setIsSavingProfile(false); }
  };

  const handleToggleTheme = async () => {
    const nextTheme = user?.theme === 'dark' ? 'light' : 'dark';
    await authApi.saveThemePreference(nextTheme);
    await refreshSession();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Staff Alerts, Announcements & Profile
          </Text>
          <Text style={styles.headerSub}>
            CVO Field Officer Portal • {user?.position || 'Field Officer'}
          </Text>
        </View>
      </View>

      {/* Segmented Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'alerts' && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab('alerts')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'alerts' && styles.tabBtnTextActive,
            ]}
          >
            🚨 Staff Alerts & Notices ({combinedFeed.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'profile' && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab('profile')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'profile' && styles.tabBtnTextActive,
            ]}
          >
            🛡️ Officer Profile
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'alerts' ? (
        <>
          <View style={styles.filterRow}>
            {(['ALL', 'high', 'medium', 'low'] as const).map((sev) => (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.sevChip,
                  severityFilter === sev && styles.sevChipActive,
                ]}
                onPress={() => setSeverityFilter(sev)}
              >
                <Text
                  style={[
                    styles.sevChipText,
                    severityFilter === sev && styles.sevChipTextActive,
                  ]}
                >
                  {sev === 'ALL' ? 'All Priorities' : sev.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={combinedFeed}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={loadStaffAlertsAndNotices}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>
                  No Active Staff Outbreaks or Announcements
                </Text>
                <Text style={styles.emptySub}>
                  Pull down to sync with `disease_alerts` and CVO staff
                  announcements.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.card,
                  item.severity === 'high' && styles.cardHigh,
                ]}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.catBadge}>{item.category}</Text>
                  <Text style={styles.sevBadgeText}>
                    Priority: {item.severity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.alertTitle}>{item.title}</Text>
                <Text style={styles.metaText}>📍 {item.barangay}</Text>
                <Text style={styles.bodyText}>{item.body}</Text>
                <Text style={styles.dateText}>
                  Issued: {new Date(item.date).toLocaleString()}
                </Text>
              </View>
            )}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.card}>
            <View style={styles.avatarHeader}>
              <TouchableOpacity onPress={handleUploadOfficerAvatar}>
                {user?.profileImageUrl ? (
                  <Image
                    source={{ uri: user.profileImageUrl }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarLetter}>
                      {(user?.firstName || 'O')[0]}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{user?.fullName}</Text>
                <Text style={styles.metaText}>
                  Role: Approved CVO Field Officer (`cityvethub-field-officers`)
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Position / Title</Text>
            <TextInput
              style={styles.input}
              value={position}
              onChangeText={setPosition}
            />

            <Text style={styles.fieldLabel}>Employee / PRC ID</Text>
            <TextInput
              style={styles.input}
              value={employeeId}
              onChangeText={setEmployeeId}
            />

            <Text style={styles.fieldLabel}>Assigned Barangay Area</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={assignedArea}
                onValueChange={(v) => setAssignedArea(v as IliganBarangay)}
              >
                {ILIGAN_BARANGAYS.map((b) => (
                  <Picker.Item key={b} label={b} value={b} />
                ))}
              </Picker>
            </View>

            <Text style={styles.fieldLabel}>Home Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
            />

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveOfficerProfile}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Officer Profile</Text>
              )}
            </TouchableOpacity>

          </View>
        </ScrollView>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#00AEEF' },
  tabBtnText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  tabBtnTextActive: { color: '#FFFFFF' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  sevChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  sevChipActive: { backgroundColor: '#1E293B' },
  sevChipText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  sevChipTextActive: { color: '#FFFFFF' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 28,
    borderRadius: 12,
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
  emptySub: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHigh: { borderLeftWidth: 5, borderLeftColor: '#EF4444' },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catBadge: { fontSize: 11, fontWeight: 'bold', color: '#0284C7' },
  sevBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#B45309' },
  alertTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  metaText: { fontSize: 12, color: '#64748B', marginVertical: 4 },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  dateText: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
  avatarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00AEEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  themeLink: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: 'bold',
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
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
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: '#00AEEF',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 18,
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  logoutFullBtn: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  logoutFullBtnText: { color: '#D9534F', fontWeight: 'bold', fontSize: 13 },
});
```

## File: src/screens/Profile/OwnedPetPassportScreen.tsx
```typescript
import CallButton from '../../components/CallButton';
import { useThemedStyles } from '../../theme';
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
import { useAdoptionStore, useAuthStore } from '../../store';

export default function OwnedPetPassportScreen({ route, navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const initialPet = route.params?.pet || {};
  const petProfileId = String(
    initialPet.petProfileId || initialPet.id || initialPet.$id || ''
  );

  const { listOwnPet } = useAdoptionStore();
  const { user } = useAuthStore();

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
  const [editColor,setEditColor] = useState('');
  const [editSex, setEditSex] = useState<'Male' | 'Female'>('Male');
  const [editAge, setEditAge] = useState('1');
  const [editVitalStatus, setEditVitalStatus] = useState<'Alive' | 'Deceased' | 'Missing'>('Alive');
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
      // 1. Load private `pet_profiles` row
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

      // Parent candidates are stable Appwrite pet IDs; do not use names as foreign keys.
      try {
        const parentsResponse = await databases.listDocuments(
          APPWRITE_DATABASE_ID, TABLES.PET_PROFILES,
          [Query.equal('ownerId', profile.ownerId), Query.limit(100)]
        );
        setPossibleParents(parentsResponse.documents.filter(candidate =>
          candidate.$id !== petProfileId && candidate.species === profile.species
        ) as unknown as PetProfileRow[]);
      } catch { setPossibleParents([]); }

      // 2. Find linked official `pets` row (if verified)
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
        // Fallback if not yet in `pets`
      }
      setOfficialPetId(resolvedOfficialId);

      // 3. Load Official Veterinary Records (`medical_records`)
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

      // 4. Load Owner-Uploaded Health Documents (`pet_health_uploads`)
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

      // 5. Load Ownership History (`ownership_history`)
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

      // 6. Check if pet already has a non-adopted listing
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        // Pending or Verified pets update public-safe details & passport contact
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
        {/* Header & Verification Status */}
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

        {/* Action Toolbar */}
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
          <Text style={styles.petBreed}>Status: {petDoc?.vitalStatus || 'Alive'}</Text>
          <Text style={styles.petBreed}>Parent: {petDoc?.ancestryParentName || possibleParents.find(p => p.$id === petDoc?.ancestryParentId)?.petName || 'Unknown / not listed'}</Text>
          <Text style={styles.petBreed}>Tap Edit Profile & QR Privacy above to update ancestry.</Text>
        </View>

        {!!petDoc?.emergencyContact && <View style={[styles.sectionCard, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Emergency contact</Text>
            <Text style={styles.petBreed}>{petDoc.emergencyContact}</Text>
          </View>
          <CallButton phone={petDoc.emergencyContact}/>
        </View>}

        {/* QR Digital Passport Card */}
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

        {/* Section: Official CVO Veterinary Records (`medical_records`) */}
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

        {/* Section: Owner-Uploaded Health Documents (`pet_health_uploads`) */}
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

        {/* Section: Chain of Custody / Ownership History (`ownership_history`) */}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
                  <BreedPicker species={editSpecies} value={editBreed} onChange={setEditBreed}/>
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
              <TextInput style={styles.textInput} value={editColor} onChangeText={setEditColor}
                maxLength={50} placeholder="e.g. Black, white, brown, tabby" placeholderTextColor="#94A3B8"/>
              <Text style={styles.fieldLabel}>Vital status (alive / deceased / missing)</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={editVitalStatus} onValueChange={v => setEditVitalStatus(v)}>
                  <Picker.Item label="Alive" value="Alive"/>
                  <Picker.Item label="Deceased" value="Deceased"/>
                  <Picker.Item label="Missing" value="Missing"/>
                </Picker>
              </View>
              <Text style={styles.fieldLabel}>Ancestry — linked parent</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={editAncestryParentId} onValueChange={setEditAncestryParentId}>
                  <Picker.Item label="Unknown / not listed" value=""/>
                  {possibleParents.map(parent => (
                    <Picker.Item key={parent.$id} label={`${parent.petName} · ${parent.breed}`} value={parent.$id}/>
                  ))}
                  {!!petDoc?.ancestryParentId && !possibleParents.some(p => p.$id === petDoc.ancestryParentId) &&
                    <Picker.Item label={`${petDoc.ancestryParentName || 'Historical parent'} (retained)`} value={petDoc.ancestryParentId}/>}
                </Picker>
              </View>
              <Text style={[styles.fieldLabel, { fontSize: 11, fontWeight: '400' }]}>Parent links persist when pets change owners; self-parenting and circular ancestry are rejected by the CityVetHub Function.</Text>

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
        </View>
      </Modal>

      {/* Modal 2: Upload Dated Health Document (`addPetHealthUpload`) */}
      <Modal
        visible={isHealthModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsHealthModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Upload Personal Health Document
            </Text>
            <Text style={styles.modalSub}>
              Attach a dated vaccination booklet page or vet receipt (labeled as
              owner-supplied).
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
                  : '📄 Select Document Image (<= 5MB)'}
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
          </View>
        </View>
      </Modal>

      {/* Modal 3: List Owned Pet for Adoption (`listOwnPetForAdoption`) */}
      <Modal
        visible={isAdoptModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAdoptModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
        </View>
      </Modal>
    </ScrollView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 40 },
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
```

## File: src/screens/Profile/SettingsScreen.tsx
```typescript
import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth';
import { normalizeBarangay, ILIGAN_BARANGAYS } from '../../store/types/constants';
import { Picker } from '@react-native-picker/picker';
import { useAppPalette } from '../../theme';
import CallButton from '../../components/CallButton';

const Panel = ({ title, hint, children, colors }: any) => (
  <View style={{ borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: 17, marginBottom: 16 }}>
    <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
    {!!hint && <Text style={{ color: colors.secondary, marginTop: 5, marginBottom: 15, fontSize: 12, lineHeight: 18 }}>{hint}</Text>}
    {children}
  </View>
);
const Action = ({ label, onPress, colors, secondary = false, danger = false, disabled = false }: any) => (
  <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{ backgroundColor: danger ? '#FFF0F1' : secondary ? colors.surfaceMuted : '#3478F6',
      padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, opacity: disabled ? .5 : 1 }}>
    <Text style={{ fontWeight: '800', color: danger ? '#B63343' : secondary ? colors.text : '#FFFFFF' }}>{label}</Text>
  </TouchableOpacity>
);

/** Shared Settings for Pet Owner and Field Officer. Admin features deliberately absent. */
export default function SettingsScreen() {
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const { user, refreshSession, logout, setTheme } = useAuthStore();
  const [name, setName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.contactNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [barangay, setBarangay] = useState(normalizeBarangay(user?.barangay));
  const [position, setPosition] = useState(user?.position || 'Field Officer');
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [assignedArea, setAssignedArea] = useState(normalizeBarangay(user?.assignedArea || user?.barangay));
  const [busy, setBusy] = useState(false);
  const [securityAction, setSecurityAction] = useState<'password' | 'email' | null>(null);
  const [existingPassword, setExistingPassword] = useState('');
  const [securityValue, setSecurityValue] = useState('');
  const [securityConfirm, setSecurityConfirm] = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const isOfficer = user?.contractRole === 'officer';
  const inputStyle = { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border,
    borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, marginTop: 5, marginBottom: 12, fontSize: 14 } as const;
  const label = (caption: string) => <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: '700' }}>{caption}</Text>;
  const saveProfile = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Enter your full name.');
    setBusy(true);
    try {
      await authApi.saveProfile({ fullName: name.trim(), phone: phone.trim(), address: address.trim(), barangay,
        ...(isOfficer ? { position, employeeId, assignedArea } : {}) });
      await refreshSession();
      Alert.alert('Saved', 'Your account information was updated.');
    } catch (e: any) { Alert.alert('Profile update failed', e?.message || 'Try again.'); }
    finally { setBusy(false); }
  };
  const changePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true,
        aspect: [1, 1], quality: 0.75 });
      if (result.canceled || !result.assets?.[0]) return;
      setBusy(true);
      const asset = result.assets[0];
      await authApi.uploadAndSaveAvatar(asset);
      setLocalAvatar(asset.uri);
      await refreshSession();
      Alert.alert('Profile photo updated', 'Your uploaded photo has been saved to Appwrite.');
    } catch (e: any) { Alert.alert('Photo upload failed', e?.message || 'Please retry with a JPG or PNG under 5 MB.'); }
    finally { setBusy(false); }
  };
  const chooseTheme = async (choice: 'light'|'dark') => {
    try { await setTheme(choice); }
    catch (e:any) { Alert.alert('Theme preference', e?.message || 'Unable to save preference.'); }
  };
  const saveSecurity = async () => {
    if (!existingPassword) return Alert.alert('Required', 'Enter your current password.');
    if (securityAction === 'password' && (securityValue.length < 12 || securityValue !== securityConfirm)) {
      return Alert.alert('Password rules', 'Use at least 12 characters and make sure the confirmation matches.');
    }
    if (securityAction === 'email' && !/^\S+@\S+\.\S+$/.test(securityValue.trim())) {
      return Alert.alert('Invalid email', 'Enter a valid new email address.');
    }
    setBusy(true);
    try {
      if (securityAction === 'password') await authApi.changePassword(existingPassword, securityValue);
      else await authApi.changeEmail(securityValue.trim(), existingPassword);
      await refreshSession();
      setSecurityAction(null); setExistingPassword(''); setSecurityValue(''); setSecurityConfirm('');
      Alert.alert('Account updated', 'Your security information has been changed.');
    } catch (e:any) { Alert.alert('Could not update account', e?.message || 'Please check your current password.'); }
    finally { setBusy(false); }
  };
  const confirmLogout = () => Alert.alert('Sign out of CityVetHub?', 'You can log back in with the same account.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
  ]);
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: Math.max(24, insets.bottom + 16) }}>
      <Text style={{ fontSize: 26, color: colors.text, fontWeight: '900', marginBottom: 6 }}>Settings</Text>
      <Text style={{ color: colors.secondary, marginBottom: 20 }}>Your account, appearance, and security.</Text>
      <Panel title="My account" hint="Changes are shared with the CityVetHub website." colors={colors}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          {localAvatar || user?.profileImageUrl
            ? <Image source={{ uri: localAvatar || user?.profileImageUrl }} style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceMuted }}/>
            : <View style={{ width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryMuted }}>
                <Text style={{ color: colors.primary, fontSize: 23, fontWeight: '900' }}>{(user?.fullName || 'U')[0]}</Text>
              </View>}
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{user?.fullName}</Text>
            <Text style={{ color: colors.secondary, fontSize: 12, marginTop: 5 }}>{isOfficer ? 'Field Officer' : 'Pet Owner'}</Text>
            <TouchableOpacity onPress={changePhoto} disabled={busy} style={{ marginTop: 9 }}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>📷 Change profile picture</Text></TouchableOpacity>
          </View>
        </View>
        {label('Full name')}<TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.secondary}/>
        {label('Contact number')}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput style={[inputStyle, { flex: 1 }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.secondary}/>
          <CallButton phone={phone}/>
        </View>
        {label('Barangay')}<View style={[inputStyle, { paddingHorizontal: 0, paddingVertical: 0 }]}>
          <Picker selectedValue={barangay} onValueChange={value=>setBarangay(normalizeBarangay(value))} style={{ color: colors.text }}>
            {ILIGAN_BARANGAYS.map(b => <Picker.Item key={b} label={b} value={b}/>)}</Picker></View>
        {label('Home address')}<TextInput style={inputStyle} value={address} onChangeText={setAddress} placeholderTextColor={colors.secondary}/>
        {isOfficer && <>
          {label('Position')}<TextInput style={inputStyle} value={position} onChangeText={setPosition}/>
          {label('Employee/PRC ID')}<TextInput style={inputStyle} value={employeeId} onChangeText={setEmployeeId}/>
          {label('Assigned barangay')}<View style={[inputStyle, { padding: 0 }]}><Picker selectedValue={assignedArea} onValueChange={value=>setAssignedArea(normalizeBarangay(value))} style={{ color: colors.text }}>
            {ILIGAN_BARANGAYS.map(b=><Picker.Item key={b} label={b} value={b}/>)}</Picker></View>
        </>}
        <Action label={busy ? 'Saving…' : 'Save account details'} onPress={saveProfile} colors={colors} disabled={busy}/>
      </Panel>
      <Panel title="Appearance" hint="Your selected theme is saved to your Appwrite account and follows you between sessions." colors={colors}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['light','dark'] as const).map(value=><TouchableOpacity key={value} onPress={()=>chooseTheme(value)}
            style={{ flex: 1, borderWidth: 2, borderColor: user?.theme === value ? colors.primary : colors.border,
              backgroundColor: user?.theme === value ? colors.primaryMuted : colors.surface, alignItems: 'center', padding: 16, borderRadius: 14 }}>
            <Text style={{ fontSize: 19 }}>{value==='light' ? '☀️' : '🌙'}</Text><Text style={{ color: colors.text, fontWeight: '800' }}>{value==='light' ? 'Light' : 'Dark'} {user?.theme===value?'✓':''}</Text>
          </TouchableOpacity>)}</View>
      </Panel>
      <Panel title="Security & session" hint="Change your password securely from the account service. Never share a session or server API key." colors={colors}>
        <Text style={{ color: colors.secondary, marginBottom: 6 }}>Signed in as {user?.email}</Text>
        <Action label="Change password" secondary colors={colors} onPress={()=>setSecurityAction('password')}/>
        <Action label="Change email" secondary colors={colors} onPress={()=>setSecurityAction('email')}/>
        <Action label="Sign out" danger colors={colors} onPress={confirmLogout}/>
      </Panel>
    </ScrollView>
    <Modal visible={securityAction !== null} transparent animationType="fade" onRequestClose={()=>setSecurityAction(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 18 }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
          style={{ borderRadius: 20, backgroundColor: colors.surface, padding: 18 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '900', marginBottom: 16 }}>
            {securityAction==='password' ? 'Change password' : 'Change email'}
          </Text>
          {label('Current password')}
          <TextInput style={inputStyle} value={existingPassword} onChangeText={setExistingPassword}
            secureTextEntry autoCapitalize="none" placeholder="Current password" placeholderTextColor={colors.secondary}/>
          {label(securityAction==='password'?'New password':'New email')}
          <TextInput style={inputStyle} value={securityValue} onChangeText={setSecurityValue}
            secureTextEntry={securityAction==='password'} autoCapitalize="none" placeholderTextColor={colors.secondary}
            keyboardType={securityAction==='email'?'email-address':'default'}/>
          {securityAction==='password' && <>{label('Confirm new password')}
            <TextInput style={inputStyle} value={securityConfirm} onChangeText={setSecurityConfirm}
              secureTextEntry placeholderTextColor={colors.secondary}/></>}
          <Action label={busy?'Saving…':'Save changes'} disabled={busy} onPress={saveSecurity} colors={colors}/>
          <Action label="Cancel" secondary colors={colors} onPress={()=>setSecurityAction(null)}/>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}
```

## File: src/screens/Profile/UserProfileScreen.tsx
```typescript
import CallButton from '../../components/CallButton';
import BreedPicker from '../../components/BreedPicker';
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
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
}

export default function UserProfileScreen() {
  const styles = useThemedStyles(baseStyles);
  const { user, logout, refreshSession } = useAuthStore();
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
  const [newPetVitalStatus, setNewPetVitalStatus] = useState<'Alive' | 'Deceased' | 'Missing'>('Alive');
  const [newPetParentId, setNewPetParentId] = useState('');
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      // 1. Fetch Owner's Personal Pet Inventory (`pet_profiles`)
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
          photoUrl: getMediaFileUrl(doc.photoFileId),
        };
      });

      setMyPets(mappedPets);
      if (mappedPets.length > 0 && !selectedVerifPetId) {
        setSelectedVerifPetId(mappedPets[0].petProfileId);
      }

      // 2. Fetch Active Gov ID Categories & Owner Verification Request
      const [cats, verifReq] = await Promise.all([
        authApi.getActiveIdCategories().catch(() => []),
        authApi.getMyVerificationRequest(String(user.id)).catch(() => null),
      ]);
      setIdCategories(cats);
      if (cats.length > 0 && !selectedIdCategoryId) {
        setSelectedIdCategoryId(cats[0].$id);
      }
      setLatestVerifReq(verifReq);

      // 3. Fetch Adoption Applications (Outgoing & Incoming)
      await Promise.all([
        fetchMyApplications(),
        fetchIncomingApplications(),
      ]);
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

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

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
      Alert.alert('Invalid Age', 'Age must be a whole number between 0 and 40.');
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
      setNewPetTitle('');
      setNewPetDescription('');
      setNewPetLostFoundMsg('');
      setPetImageAsset(null);

      await fetchProfileData();
      Alert.alert(
        'Pet Added to Inventory',
        'Your pet profile and instant QR Passport have been created! Tap your pet card to view the QR code, upload health documents, or request official CVO verification.'
      );
    } catch (error: any) {
      Alert.alert(
        'Failed to Add Pet',
        error?.message || 'Could not create pet profile in Appwrite.'
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
      Alert.alert('Profile Saved', 'Your profile details have been updated.');
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
        Alert.alert('Avatar Updated', 'Your profile picture has been saved.');
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

  const handleToggleTheme = async () => {
    const nextTheme = user?.theme === 'dark' ? 'light' : 'dark';
    try {
      await authApi.saveThemePreference(nextTheme);
      await refreshSession();
    } catch (error: any) {
      Alert.alert('Theme Error', error?.message || 'Could not update theme.');
    }
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
      Alert.alert('ID Category Required', 'Please select a valid Government ID type.');
      return;
    }
    if (!govIdAsset) {
      Alert.alert(
        'Government ID Photo Required',
        'Please select a clear photo of your Government ID (<= 5MB).'
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
                `Pet ownership has been transferred to ${applicantName} and recorded in ownership_history.`
              );
            } catch (err: any) {
              Alert.alert('Transfer Error', err?.message || 'Transfer failed.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to exit CityVetHub?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const verifStatus = user?.accountVerificationStatus || 'unverified';

  return (
    <View style={styles.container}>
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
                          : pet.verificationStatus === 'pending'
                          ? styles.badgePending
                          : styles.badgeDraft,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          pet.verificationStatus === 'verified'
                            ? styles.badgeTextReg
                            : pet.verificationStatus === 'pending'
                            ? styles.badgeTextPending
                            : styles.badgeTextDraft,
                        ]}
                      >
                        {pet.verificationStatus === 'verified'
                          ? `CVO ID: ${pet.officialRegistryId || 'VERIFIED'}`
                          : pet.verificationStatus.toUpperCase()}
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
            {/* Owner's Incoming Applications on Their Listed Pets */}
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
                      🐾 Pet: {inc.petName || inc.listingTitle || 'Adoption listing'}
                    </Text>
                    <Text style={styles.noticeText}>
                      📞 Contact: {inc.contactNumber || inc.contact_number}
                    </Text>
                    <CallButton phone={inc.contactNumber || inc.contact_number}/>
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

            {/* Outgoing Applications Submitted by This User */}
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
                      Listing #{String(app.listingId || app.pet).slice(0, 8)}
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
                  >
                    {idCategories.length === 0 ? (
                      <Picker.Item
                        label="No active ID categories configured on web"
                        value=""
                      />
                    ) : (
                      idCategories.map((c) => (
                        <Picker.Item key={c.$id} label={c.name} value={c.$id} />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
                    onPress={() => {setNewPetSpecies(sp);setNewPetBreed('');}}
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
              <BreedPicker species={newPetSpecies} value={newPetBreed} onChange={setNewPetBreed}/>
              <Text style={styles.fieldLabel}>Coat color (optional)</Text>
              <TextInput style={styles.textInput} value={newPetColor} onChangeText={setNewPetColor}
                placeholder="e.g. Brown, white, tabby" placeholderTextColor="#94A3B8" maxLength={50}/>

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
                <Picker selectedValue={newPetVitalStatus} onValueChange={v => setNewPetVitalStatus(v)}>
                  <Picker.Item label="Alive" value="Alive"/>
                  <Picker.Item label="Deceased" value="Deceased"/>
                  <Picker.Item label="Missing" value="Missing"/>
                </Picker>
              </View>
              <Text style={styles.fieldLabel}>Parent pet (optional ancestry)</Text>
              <View style={styles.pickerBox}>
                <Picker selectedValue={newPetParentId} onValueChange={setNewPetParentId}>
                  <Picker.Item label="Unknown / not in inventory" value=""/>
                  {myPets.filter(parent => parent.species === newPetSpecies).map(parent => (
                    <Picker.Item key={parent.petProfileId} label={`${parent.name} · ${parent.breed}`} value={parent.petProfileId}/>
                  ))}
                </Picker>
              </View>
              <Text style={[styles.fieldLabel, { fontSize: 11, fontWeight: '400' }]}>Only pets you own of the same species can be selected. CVO records retain the ancestry link after adoption.</Text>

              <Text style={styles.fieldLabel}>Barangay (Iligan City)</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={newPetBarangay}
                  onValueChange={(v) => setNewPetBarangay(v as IliganBarangay)}
                >
                  {ILIGAN_BARANGAYS.map((b) => (
                    <Picker.Item key={b} label={b} value={b} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Passport Headline / Title</Text>
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
        </View>
      </Modal>

      {/* Modal 2: Edit Profile & Privacy */}
      <Modal
        visible={isEditProfileVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditProfileVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
        </View>
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
                : 'Personal QR Passport (Owner Consented Fields)'}
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
    </View>
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
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  logoutBtnText: { color: '#D9534F', fontSize: 11, fontWeight: 'bold' },
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
  scrollContent: { padding: 16, paddingBottom: 36 },
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
```

## File: src/screens/Surveillance/DiseaseMap.tsx
```typescript
import FullscreenMap from '../../components/FullscreenMap';
import * as ImagePicker from 'expo-image-picker';
import { uploadMediaFile } from '../../api/client';
import { requirePhase422Backend } from '../../api/phase422';
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect } from 'react';
import { Picker } from '@react-native-picker/picker';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  getBarangayCoords,
  findNearestBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { useSurveillanceStore, useAuthStore } from '../../store/index';

export default function DiseaseMap() {
  const styles = useThemedStyles(baseStyles);
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const {
    incidentCategories,
    fetchIncidentCategories,
    reportIncident,
    isLoading,
  } = useSurveillanceStore();

  const initialBrgy = normalizeBarangay(user?.barangay);
  const initialCoords = getBarangayCoords(initialBrgy);

  const [selectedBarangay, setSelectedBarangay] =
    useState<IliganBarangay>(initialBrgy);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lat, setLat] = useState<number>(initialCoords.latitude);
  const [lng, setLng] = useState<number>(initialCoords.longitude);
  const [description, setDescription] = useState('');
  const [incidentPhoto, setIncidentPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const isOwnerVerified = user?.accountVerificationStatus === 'verified';

  useEffect(() => {
    fetchIncidentCategories();
  }, [fetchIncidentCategories]);

  useEffect(() => {
    if (incidentCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(incidentCategories[0].name);
    }
  }, [incidentCategories, selectedCategory]);

  const handleBarangayPickerChange = (brgy: IliganBarangay) => {
    setSelectedBarangay(brgy);
    const coords = getBarangayCoords(brgy);
    setLat(coords.latitude);
    setLng(coords.longitude);
  };

  const updateMapPin = (newLat: number, newLng: number) => {
    setLat(newLat); setLng(newLng);
    setSelectedBarangay(findNearestBarangay(newLat, newLng));
  };

  const pickIncidentPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.8});
      if(result.canceled || !result.assets?.[0])return;
      if(result.assets[0].fileSize && result.assets[0].fileSize! > 5_000_000) throw new Error('Photo must be 5 MB or smaller.');
      setIncidentPhoto(result.assets[0]);
    }catch(e:any){Alert.alert('Photo selection failed',e?.message || 'Please use a JPG, PNG, or WEBP under 5 MB.');}
  };

  const handleSubmitIncident = async () => {
    if (!isOwnerVerified) {
      Alert.alert(
        'CVO Account Verification Required',
        'Only CVO-Verified Pet Owners can submit incident reports. Please upload your Government ID in Profile > ID Verify first.'
      );
      return;
    }

    if (!selectedCategory) {
      Alert.alert(
        'Category Required',
        'Please select an active incident category.'
      );
      return;
    }

    try {
      setSubmitting(true);
      await requirePhase422Backend();
      const photoFileId = incidentPhoto ? await uploadMediaFile(incidentPhoto) : '';
      await reportIncident({
        disease: selectedCategory,
        barangay: selectedBarangay,
        lat,
        lng,
        description: description.trim(),
        photoFileId,
      });

      setDescription('');
      setIncidentPhoto(null);
      Alert.alert(
        'Incident Report Submitted (Pending)',
        `Your report (${selectedCategory}) at Brgy. ${selectedBarangay} (${lat.toFixed(
          4
        )}, ${lng.toFixed(
          4
        )}) has been privately logged for CVO review.`
      );
    } catch (error: any) {
      Alert.alert(
        'Submission Blocked',
        error?.message || 'Could not submit incident report.'
      );
    } finally {setSubmitting(false);}
  };

  // Interactive Iligan City Pin-Drop Leaflet Map (No staff-only counters or other users' raw reports exposed)
  const leafletPickerHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${lat}, ${lng}], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var marker = L.marker([${lat}, ${lng}]).addTo(map);
          marker.bindPopup('<b>Selected Incident Pin</b><br>Tap anywhere on map to move pin.').openPopup();

          map.on('click', function(e) {
            var clickedLat = e.latlng.lat;
            var clickedLng = e.latlng.lng;
            marker.setLatLng([clickedLat, clickedLng]);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                lat: clickedLat,
                lng: clickedLng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Verification Prerequisite Banner (Contract Section 08.F) */}
      {!isOwnerVerified ? (
        <View style={styles.unverifiedBanner}>
          <Text style={styles.unverifiedTitle}>
            🔒 CVO Account Verification Required
          </Text>
          <Text style={styles.unverifiedText}>
            To prevent false alarms, only CVO-Verified Pet Owners (with an
            approved Government ID and at least 1 pet) can submit incident
            reports. Note: A verified pet alone does not verify your account.
          </Text>
          <TouchableOpacity
            style={styles.verifyLinkBtn}
            onPress={() =>
              navigation.navigate('UserProfile')
            }
          >
            <Text style={styles.verifyLinkBtnText}>
              Go to My Profile &gt; ID Verify
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.verifiedBanner}>
          <Text style={styles.verifiedBannerText}>
            ✓ Verified Pet Owner — Tap the Iligan City map below to drop a pin
            at the incident location.
          </Text>
        </View>
      )}

      {/* Map Pin Selector */}
      <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => setFullscreen(true)}
          style={{ backgroundColor: '#3478F6', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>⛶ Maximize map</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.mapCard}>
        <WebView
          originWhitelist={['*']}
          source={{ html: leafletPickerHTML }}
          style={styles.map}
          javaScriptEnabled
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (
                typeof data.lat === 'number' &&
                typeof data.lng === 'number'
              ) {
                updateMapPin(data.lat, data.lng);
              }
            } catch {
              // Ignore malformed message
            }
          }}
        />
        <View style={styles.coordsBar}>
          <Text style={styles.coordsText}>
            📍 Pin Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)} • Brgy.{' '}
            {selectedBarangay}
          </Text>
        </View>
      </View>

      <FullscreenMap visible={fullscreen} onClose={() => setFullscreen(false)} html={leafletPickerHTML}
        title="Select incident location" onPick={updateMapPin}/>

      {/* Incident Submission Form */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Submit Suspected Incident Report</Text>
        <Text style={styles.formSubtitle}>
          Reports are routed privately to CVO Field Officers and Administrators.
        </Text>

        <Text style={styles.label}>
          Incident Category (Admin-Defined Active Categories) *
        </Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={selectedCategory}
            onValueChange={(v) => setSelectedCategory(String(v))}
            style={{ color: '#1E293B', width: '100%' }}
          >
            {incidentCategories.length === 0 ? (
              <Picker.Item
                label="Loading active incident categories..."
                value=""
              />
            ) : (
              incidentCategories.map((cat) => (
                <Picker.Item key={cat.$id} label={cat.name} value={cat.name} />
              ))
            )}
          </Picker>
        </View>

        <Text style={styles.label}>
          Iligan City Barangay (Auto-filled from map tap, adjustable) *
        </Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={selectedBarangay}
            onValueChange={(v) =>
              handleBarangayPickerChange(v as IliganBarangay)
            }
            style={{ color: '#1E293B', width: '100%' }}
          >
            {ILIGAN_BARANGAYS.map((b) => (
              <Picker.Item key={b} label={b} value={b} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>
          Description / Landmark / Animal Symptoms (Optional, max 1000 chars)
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="Describe the animal, symptoms, or landmark near the pinned coordinates..."
          placeholderTextColor="#94A3B8"
          maxLength={1000}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.label}>Evidence photo (optional, JPG/PNG/WEBP, max 5 MB)</Text>
        <TouchableOpacity onPress={pickIncidentPhoto} style={styles.pickerBox} accessibilityRole="button">
          <Text style={{color:'#1763AA',padding:12}}>{incidentPhoto ? `✓ ${incidentPhoto.fileName || 'Photo selected'} — Change` : '+ Attach incident photo'}</Text>
        </TouchableOpacity>
        {incidentPhoto ? <><Image source={{uri:incidentPhoto.uri}} style={{height:150,borderRadius:12,marginBottom:9}} resizeMode="cover"/>
          <TouchableOpacity onPress={()=>setIncidentPhoto(null)}><Text style={{color:'#B91C1C',marginBottom:12}}>Remove photo</Text></TouchableOpacity></> : null}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            !isOwnerVerified && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmitIncident}
          disabled={!isOwnerVerified || isLoading || submitting}
        >
          {isLoading || submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isOwnerVerified
                ? 'Submit Incident Report to CVO'
                : 'Account Verification Required to Submit'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 36 },
  unverifiedBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  unverifiedTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 4,
  },
  unverifiedText: { fontSize: 12, color: '#78350F', lineHeight: 17 },
  verifyLinkBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  verifyLinkBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  verifiedBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  verifiedBannerText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
  mapCard: {
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  map: { flex: 1 },
  coordsBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coordsText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  formSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    height: 85,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#1E293B',
  },
  submitBtn: {
    backgroundColor: '#D9534F',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnDisabled: { backgroundColor: '#94A3B8' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
```

## File: src/store/types/adoption.ts
```typescript
import { AdoptionListing } from './pets';
import { AppwriteMeta } from './auth';

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESERVED'
  | 'COMPLETED'
  | 'OWNER_APPROVED';

export type ListingStatus = 'available' | 'reserved' | 'adopted';

export interface AdoptionApplicationRow extends AppwriteMeta {
  listingId: string;
  petId: string;
  applicantId: string;
  applicantName: string;
  message: string;
  contactNumber: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'owner_approved';
  submittedAt: string;
}

export interface AdoptionApplication {
  id?: string | number;
  listingId?: string;
  pet: string | number;
  petName?: string;
  listingTitle?: string;
  applicant?: string | number;
  applicantId?: string;
  applicantName?: string;
  message?: string;
  contact_number: string;
  contactNumber?: string;
  address: string;
  reason_for_adoption: string;
  has_other_pets: boolean;
  status: ApplicationStatus;
  applied_at?: string;
}

export interface AdoptionState {
  availablePets: AdoptionListing[];
  myApplications: AdoptionApplication[];
  incomingApplications: AdoptionApplication[];
  isLoading: boolean;
  fetchAvailablePets: () => Promise<void>;
  fetchMyApplications: () => Promise<void>;
  fetchIncomingApplications: () => Promise<void>;
  submitApplication: (data: Partial<AdoptionApplication>) => Promise<void>;
  listOwnPet: (payload: {
    petProfileId: string;
    title: string;
    description: string;
    requirements?: string;
    housingRequirement: 'any' | 'apartment' | 'house' | 'yard';
    publishPetPhoto: boolean;
    showOwnerName: boolean;
    publishOwnerPhoto: boolean;
  }) => Promise<void>;
  reviewApplication: (
    applicationId: string,
    decision: 'approve' | 'decline'
  ) => Promise<void>;
  confirmTransfer: (applicationId: string) => Promise<void>;
  toggleListingVisibility: (listingId: string) => Promise<void>;
}

// Phase 4.16 Community Social Hub Types
export type CommunityPrivacy = 'public' | 'private';
export type ChannelMemberStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type VoteValue = -1 | 0 | 1;
export type NoticeAudience = 'owners' | 'officers' | 'both';
export type NoticeCategory = 'outbreak' | 'advisory' | 'announcement';

export interface CommunityChannel {
  id: string;
  name: string;
  description: string;
  privacy: CommunityPrivacy;
  createdByName?: string;
  isCreator: boolean;
  membership: ChannelMemberStatus;
  canRead: boolean;
  createdAt?: string;
}

export interface CommunityPost {
  id: string;
  channelId: string;
  channelName?: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  imageFileIds: string[];
  isDeleted: boolean;
  createdAt: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  myVote?: VoteValue;
  commentCount?: number;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentCommentId: string;
  authorId: string;
  authorName: string;
  body: string;
  isDeleted: boolean;
  createdAt: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  myVote?: VoteValue;
}

export interface ChannelJoinRequest {
  id: string;
  userId: string;
  userName: string;
  requestedAt: string;
}

export interface CommunityNotice {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  audience: NoticeAudience;
  priority: 'low' | 'medium' | 'high' | 'info';
  date: string;
  barangay: string;
  isActive: boolean;
}

export interface CommunityOverview {
  channels: CommunityChannel[];
  verified: boolean;
  role: 'owner' | 'officer' | 'admin';
  notices: CommunityNotice[];
}
```

## File: src/store/types/auth.ts
```typescript
export type Role = 'owner' | 'officer' | 'pending_officer';
export type LegacyRole = 'CITIZEN' | 'VET_OFFICER' | 'CVO_ADMIN';
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export interface AppwriteMeta {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  $permissions?: string[];
}

export interface UserProfileRow extends AppwriteMeta {
  userId: string;
  fullName: string;
  phone?: string;
  address?: string;
  barangay?: string;
  profileImageId?: string;
  position?: string;
  employeeId?: string;
  assignedArea?: string;
  shareAvatarOnListings?: boolean;
  accountVerificationStatus?: VerificationStatus;
}

export interface IdCategoryRow extends AppwriteMeta {
  name: string;
  description?: string;
  isActive: boolean;
  createdById?: string;
}

export interface OwnerVerificationRequestRow extends AppwriteMeta {
  ownerId: string;
  petProfileId: string;
  idCategoryId: string;
  idCategoryName: string;
  documentFileId: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  submittedAt: string;
  reviewedById?: string;
}

export interface CitizenProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  barangay: string;
  address?: string;
  contactNumber: string;
  profileImageId?: string;
  profileImageUrl?: string;
  position?: string;
  employeeId?: string;
  assignedArea?: string;
  shareAvatarOnListings: boolean;
  accountVerificationStatus: VerificationStatus;
  isVerified: boolean; // True ONLY when accountVerificationStatus === 'verified'
  theme: 'light' | 'dark';
  contractRole: Role;
  role: LegacyRole; // Kept for backward compatibility with existing screens
  memberSince?: string;
}

export interface AuthState {
  user: CitizenProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: any) => Promise<void>;
  logout: () => Promise<void>;
}
```

## File: src/store/types/constants.ts
```typescript
// Canonical 44 Iligan City Barangays (PSA PSGC 1030900000) — Validated by cityvethub-operations
export const ILIGAN_BARANGAYS = [
  'Abuno',
  'Acmac-Mariano Badelles Sr.',
  'Bagong Silang',
  'Bonbonon',
  'Bunawan',
  'Buru-un',
  'Dalipuga',
  'Del Carmen',
  'Digkilaan',
  'Ditucalan',
  'Dulag',
  'Hinaplanon',
  'Hindang',
  'Kabacsanan',
  'Kalilangan',
  'Kiwalan',
  'Lanipao',
  'Luinab',
  'Mahayahay',
  'Mainit',
  'Mandulog',
  'Maria Cristina',
  'Palao',
  'Panoroganan',
  'Poblacion',
  'Puga-an',
  'Rogongon',
  'San Miguel',
  'San Roque',
  'Santa Elena',
  'Santa Filomena',
  'Santiago',
  'Santo Rosario',
  'Saray',
  'Suarez',
  'Tambacan',
  'Tibanga',
  'Tipanoy',
  'Tomas L. Cabili',
  'Tubod',
  'Ubaldo Laya',
  'Upper Hinaplanon',
  'Upper Tominobo',
  'Villa Verde',
] as const;

export type IliganBarangay = (typeof ILIGAN_BARANGAYS)[number];

// Legacy alias map for old rows created before canonical enforcement
const LEGACY_BARANGAY_MAP: Record<string, IliganBarangay> = {
  Acmac: 'Acmac-Mariano Badelles Sr.',
  'Pala-o': 'Palao',
  'Tomas Cabili': 'Tomas L. Cabili',
  Sarigao: 'Santiago',
};

export const normalizeBarangay = (value?: string | null): IliganBarangay => {
  if (!value) return 'Poblacion';
  const trimmed = value.trim();
  if ((ILIGAN_BARANGAYS as readonly string[]).includes(trimmed)) {
    return trimmed as IliganBarangay;
  }
  if (trimmed in LEGACY_BARANGAY_MAP) {
    return LEGACY_BARANGAY_MAP[trimmed];
  }
  return 'Poblacion';
};

// Reference GPS coordinates for all 44 Iligan City barangays
export const ILIGAN_BARANGAY_COORDS: Record<
  IliganBarangay,
  { latitude: number; longitude: number }
> = {
  Abuno: { latitude: 8.195, longitude: 124.258 },
  'Acmac-Mariano Badelles Sr.': { latitude: 8.261, longitude: 124.256 },
  'Bagong Silang': { latitude: 8.2345, longitude: 124.2485 },
  Bonbonon: { latitude: 8.221, longitude: 124.289 },
  Bunawan: { latitude: 8.301, longitude: 124.285 },
  'Buru-un': { latitude: 8.1885, longitude: 124.1695 },
  Dalipuga: { latitude: 8.312, longitude: 124.259 },
  'Del Carmen': { latitude: 8.2255, longitude: 124.2565 },
  Digkilaan: { latitude: 8.251, longitude: 124.331 },
  Ditucalan: { latitude: 8.176, longitude: 124.205 },
  Dulag: { latitude: 8.208, longitude: 124.312 },
  Hinaplanon: { latitude: 8.2485, longitude: 124.2555 },
  Hindang: { latitude: 8.288, longitude: 124.338 },
  Kabacsanan: { latitude: 8.291, longitude: 124.302 },
  Kalilangan: { latitude: 8.195, longitude: 124.342 },
  Kiwalan: { latitude: 8.275, longitude: 124.2595 },
  Lanipao: { latitude: 8.215, longitude: 124.325 },
  Luinab: { latitude: 8.233, longitude: 124.263 },
  Mahayahay: { latitude: 8.2235, longitude: 124.2445 },
  Mainit: { latitude: 8.278, longitude: 124.351 },
  Mandulog: { latitude: 8.246, longitude: 124.281 },
  'Maria Cristina': { latitude: 8.1795, longitude: 124.1915 },
  Palao: { latitude: 8.228, longitude: 124.248 },
  Panoroganan: { latitude: 8.219, longitude: 124.365 },
  Poblacion: { latitude: 8.2285, longitude: 124.2375 },
  'Puga-an': { latitude: 8.2225, longitude: 124.2695 },
  Rogongon: { latitude: 8.235, longitude: 124.415 },
  'San Miguel': { latitude: 8.2355, longitude: 124.244 },
  'San Roque': { latitude: 8.242, longitude: 124.252 },
  'Santa Elena': { latitude: 8.239, longitude: 124.259 },
  'Santa Filomena': { latitude: 8.268, longitude: 124.2575 },
  Santiago: { latitude: 8.245, longitude: 124.242 },
  'Santo Rosario': { latitude: 8.2325, longitude: 124.2435 },
  Saray: { latitude: 8.236, longitude: 124.236 },
  Suarez: { latitude: 8.202, longitude: 124.219 },
  Tambacan: { latitude: 8.2205, longitude: 124.2335 },
  Tibanga: { latitude: 8.2415, longitude: 124.244 },
  Tipanoy: { latitude: 8.2035, longitude: 124.261 },
  'Tomas L. Cabili': { latitude: 8.2175, longitude: 124.238 },
  Tubod: { latitude: 8.2165, longitude: 124.2415 },
  'Ubaldo Laya': { latitude: 8.2245, longitude: 124.2515 },
  'Upper Hinaplanon': { latitude: 8.2535, longitude: 124.2665 },
  'Upper Tominobo': { latitude: 8.209, longitude: 124.231 },
  'Villa Verde': { latitude: 8.227, longitude: 124.244 },
};

export const getBarangayCoords = (
  barangay?: string
): { latitude: number; longitude: number } => {
  const canonical = normalizeBarangay(barangay);
  return (
    ILIGAN_BARANGAY_COORDS[canonical] || {
      latitude: 8.228,
      longitude: 124.2452,
    }
  );
};

// Finds the closest canonical Iligan barangay when user taps on the Leaflet map
export const findNearestBarangay = (
  lat: number,
  lng: number
): IliganBarangay => {
  let closest: IliganBarangay = 'Poblacion';
  let minDistance = Number.MAX_VALUE;

  for (const brgy of ILIGAN_BARANGAYS) {
    const coords = ILIGAN_BARANGAY_COORDS[brgy];
    const dist =
      Math.pow(coords.latitude - lat, 2) + Math.pow(coords.longitude - lng, 2);
    if (dist < minDistance) {
      minDistance = dist;
      closest = brgy;
    }
  }
  return closest;
};
```

## File: src/store/types/pets.ts
```typescript
import { IliganBarangay } from './constants';
import { AppwriteMeta } from './auth';

export type PetSpecies = 'DOG' | 'CAT' | 'OTHER';
export type PetGender = 'MALE' | 'FEMALE';
export type Species = 'Dog' | 'Cat';
export type Sex = 'Male' | 'Female';
export type PetVerification = 'draft' | 'pending' | 'verified' | 'rejected';
export type MedicalType = 'Vaccination' | 'Treatment';
export type VaccineType =
  | 'RABIES'
  | '5IN1'
  | '6IN1'
  | '4IN1'
  | 'DEWORM'
  | 'OTHER';

export interface PetProfileRow extends AppwriteMeta {
  color?: string;
  ownerId: string;
  petName: string;
  vitalStatus?: 'Alive' | 'Deceased' | 'Missing';
  ancestryParentId?: string;
  ancestryParentName?: string;
  species: Species;
  breed: string;
  sex: Sex;
  ageYears: number;
  barangay: string;
  homeAddress?: string;
  photoFileId?: string;
  lostFoundMessage?: string;
  emergencyContact?: string;
  shareOwnerName?: boolean;
  sharePublicPhoto?: boolean;
  shareContact?: boolean;
  sharePublicAddress?: boolean;
  profileTitle?: string;
  profileDescription?: string;
  verificationStatus?: PetVerification;
  vaccinationStatus?: string;
  officialRegistryId?: string;
  latestRequestId?: string;
}

export interface PetPassportRow extends AppwriteMeta {
  petId: string;
  petName: string;
  species: Species;
  breed: string;
  sex: Sex;
  ageYears: number;
  barangay: string;
  ownerName?: string;
  displayAddress?: string;
  contact?: string;
  lostFoundMessage?: string;
  photoFileId?: string;
  vaccinationStatus?: string;
  verificationStatus?: PetVerification;
  officialRegistryId?: string;
  profileTitle?: string;
  profileDescription?: string;
}

export interface PetHealthUploadRow extends AppwriteMeta {
  ownerId: string;
  petProfileId: string;
  title: string;
  recordDate: string;
  fileId: string;
  sharePublic: boolean;
}

export interface PetPassportMedicalRow extends AppwriteMeta {
  petProfileId: string;
  title: string;
  recordDate: string;
  fileId: string;
  sourceLabel?: string;
}

export interface MedicalRecordRow extends AppwriteMeta {
  petId: string;
  veterinarianId: string;
  recordType: MedicalType | string;
  medicineType: string;
  description?: string;
  dateAdministered: string;
}

export interface OwnershipEventRow extends AppwriteMeta {
  petId: string;
  previousOwnerId: string;
  newOwnerId: string;
  previousOwnerName?: string;
  newOwnerName?: string;
  transferType: 'Adoption' | 'Reclaim' | 'Surrender' | 'Correction';
  transferDate: string;
}

// Legacy compatibility interfaces used by existing UI components
export interface VaccinationRecord {
  id: string | number;
  vaccine_name: VaccineType | string;
  administered_date: string;
  expiration_date: string;
  administered_by: string;
  notes?: string;
}

export interface PetPassport {
  id: string | number;
  petProfileId?: string;
  owner_id: string | number;
  name: string;
  registration_number: string;
  officialRegistryId?: string;
  verificationStatus?: PetVerification;
  species: PetSpecies;
  breed: string;
  gender: PetGender;
  ageYears?: number;
  birth_date?: string;
  color_markings?: string;
  barangay: IliganBarangay | string;
  photo?: string;
  photoFileId?: string;
  is_neutered: boolean;
  vaccinations: VaccinationRecord[];
}

export interface AdoptionListing {
  id: string | number;
  listingId?: string;
  petId?: string;
  petProfileId?: string;
  postedById?: string;
  ownerDisplayName?: string;
  ownerAvatarUrl?: string;
  verificationStatus?: PetVerification;
  title?: string;
  requirements?: string;
  activityLevel?: string;
  housingRequirement?: 'any' | 'apartment' | 'house' | 'yard' | string;
  temperament?: string[];
  registered_pet: PetPassport;
  adoption_reason: string;
  adoption_fee: string;
  isActive?: boolean;
  status: 'AVAILABLE' | 'PENDING' | 'RESERVED' | 'ADOPTED' | string;
}
```

## File: src/store/types/surveillance.ts
```typescript
import { IliganBarangay } from './constants';
import { AppwriteMeta } from './auth';

export type DiseaseType =
  | 'RABIES'
  | 'PARVO'
  | 'DISTEMPER'
  | 'PANLEUK'
  | 'LEPTO'
  | 'OTHER'
  | string;
export type SeverityLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL'
  | 'low'
  | 'medium'
  | 'high'
  | 'Moderate'
  | 'Critical'
  | string;
export type AlertStatus = 'UNVERIFIED' | 'VERIFIED' | 'RESOLVED';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface IncidentCategoryRow extends AppwriteMeta {
  name: string;
  description?: string;
  isActive: boolean;
  createdById?: string;
}

export interface IncidentReportRow extends AppwriteMeta {
  reportedById: string;
  reporterRole?: 'owner' | 'officer' | 'admin';
  diseaseType: string;
  barangay: string;
  latitude: number;
  longitude: number;
  description?: string;
  status?: string;
  reportedAt: string;
  photoFileId?: string;
}

export interface OutbreakAlertRow extends AppwriteMeta {
  sourceAlertId?: string;
  title: string;
  message: string;
  diseaseType: string;
  barangay: string;
  severity: 'low' | 'medium' | 'high';
  issuedById: string;
  issuedAt: string;
  isActive: boolean;
  isOutbreak?: boolean;
  notifyOwners?: boolean;
}

export interface DiseaseAlert {
  id?: string | number;
  title: string;
  disease: DiseaseType;
  species?: 'Dog' | 'Cat';
  barangay: IliganBarangay | string;
  severity: SeverityLevel;
  status: AlertStatus;
  description: string;
  precautionary_measures?: string;
  created_at?: string;
  lat: number;
  lng: number;
  isOutbreak?: boolean;
  reporterRole?: 'owner' | 'officer' | 'admin';
  photoFileId?: string;
  sourceType?: 'ALERT' | 'INCIDENT' | 'REPORT' | 'OWNER_NOTICE';
}

export interface SurveillanceState {
  activeAlerts: DiseaseAlert[];
  staffReports: IncidentReportRow[];
  incidentCategories: IncidentCategoryRow[];
  heatMapData: Coordinates[];
  isLoading: boolean;
  fetchDiseaseAlerts: () => Promise<void>;
  fetchIncidentCategories: () => Promise<void>;
  fetchStaffReports: () => Promise<void>;
  reportIncident: (reportData: Partial<DiseaseAlert>) => Promise<void>;
}
```

## File: src/store/index.ts
```typescript
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Query } from 'react-native-appwrite';
import {
  account,
  databases,
  operate,
  APPWRITE_DATABASE_ID,
  TABLES,
  clearPrivateImageCache,
} from '../api/client';
import { authApi } from '../api/auth';
import { adoptionApi } from '../api/adoption';
import { diseaseApi } from '../api/disease';
import { CitizenProfile } from './types/auth';
import { AdoptionState, AdoptionApplication } from './types/adoption';
import {
  SurveillanceState,
  DiseaseAlert,
  IncidentCategoryRow,
  IncidentReportRow,
} from './types/surveillance';

interface AuthStoreState {
  user: CitizenProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  login: (credentials: {
    email?: string;
    username?: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isRestoring: true,

  login: async (credentials) => {
    set({ isLoading: true });
    const emailInput = (
      credentials.email ||
      credentials.username ||
      ''
    )
      .trim()
      .toLowerCase();

    try {
      try {
        await account.deleteSession('current');
      } catch {
        // Ignore if no active session exists
      }

      const session = await account.createEmailPasswordSession(
        emailInput,
        credentials.password
      );

      const profile = await authApi.resolveCurrentUser();

      // Contract Section 09.A: Block unapproved pending officers from entering protected screens
      if (profile.contractRole === 'pending_officer') {
        try {
          await operate('blockPendingOfficer', {});
        } catch {
          // Ignore if already blocked
        }
        await account.deleteSession('current').catch(() => {});
        await SecureStore.deleteItemAsync('auth_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        throw new Error(
          'Awaiting CVO Approval: Your Field Officer account is pending verification by a CVO Administrator.'
        );
      }

      await SecureStore.setItemAsync('auth_token', session.$id);

      set({
        token: session.$id,
        isAuthenticated: true,
        user: profile,
        isLoading: false,
      });
    } catch (error: any) {
      set({ isLoading: false });
      const rawMsg = String(error?.message || '');
      if (
        rawMsg.toLowerCase().includes('blocked') ||
        rawMsg.toLowerCase().includes('user_blocked') ||
        rawMsg.toLowerCase().includes('awaiting cvo approval')
      ) {
        alert(
          'Awaiting CVO Approval: Your Field Officer account is currently disabled until a CVO Administrator approves your membership in cityvethub-field-officers.'
        );
      } else {
        alert(
          rawMsg || 'Login failed. Please check your email and password.'
        );
      }
    }
  },

  setTheme: async (theme) => {
    const previous = useAuthStore.getState().user;
    if (!previous) return;
    set({ user: { ...previous, theme } }); // immediate appearance, before network request
    try {
      await authApi.saveThemePreference(theme);
    } catch (error) {
      set({ user: previous });
      throw error;
    }
  },

  refreshSession: async () => {
    set({ isRestoring: true });
    try {
      const profile = await authApi.resolveCurrentUser();
      if (profile.contractRole === 'pending_officer') {
        await account.deleteSession('current').catch(() => {});
        await SecureStore.deleteItemAsync('auth_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isRestoring: false,
        });
        return;
      }

      const savedToken = await SecureStore.getItemAsync('auth_token');
      set({
        user: profile,
        token: savedToken || 'active-session',
        isAuthenticated: true,
        isRestoring: false,
      });
    } catch {
      await SecureStore.deleteItemAsync('auth_token').catch(() => {});
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isRestoring: false,
      });
    }
  },

  logout: async () => {
    try {
      await account.deleteSession('current');
    } catch (e) {
      console.warn('Session already cleared:', e);
    }
    await SecureStore.deleteItemAsync('auth_token').catch(() => {});
    clearPrivateImageCache();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export const useAdoptionStore = create<AdoptionState>((set, get) => ({
  availablePets: [],
  myApplications: [],
  incomingApplications: [],
  isLoading: false,

  fetchAvailablePets: async () => {
    set({ isLoading: true });
    try {
      const listings = await adoptionApi.getAvailablePets();
      set({ availablePets: listings, isLoading: false });
    } catch (error) {
      console.error('Appwrite fetchAvailablePets error:', error);
      set({ isLoading: false });
    }
  },

  fetchMyApplications: async () => {
    set({ isLoading: true });
    try {
      const apps = await adoptionApi.getMyApplications();
      set({ myApplications: apps, isLoading: false });
    } catch (error) {
      console.error('Appwrite fetchMyApplications error:', error);
      set({ isLoading: false });
    }
  },

  fetchIncomingApplications: async () => {
    set({ isLoading: true });
    try {
      const res = await operate<any>('listOwnListingApplications', {});
      const rawList: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.applications)
        ? res.applications
        : Array.isArray(res?.documents)
        ? res.documents
        : [];

      const mapped: AdoptionApplication[] = rawList.map((doc: any) => ({
        id: doc.$id || doc.id,
        listingId: doc.listingId,
        pet: doc.petId || doc.listingId,
        petName: doc.petNameSnapshot || doc.petName || doc.listingTitleSnapshot || doc.listingTitle || 'Listed Companion',
        listingTitle: doc.listingTitleSnapshot || doc.listingTitle || doc.title,
        applicant: doc.applicantId,
        applicantId: doc.applicantId,
        applicantName: doc.applicantName || 'Pet Owner Applicant',
        message: doc.message || '',
        contact_number: doc.contactNumber || '',
        contactNumber: doc.contactNumber || '',
        address: 'Iligan City',
        reason_for_adoption: doc.message || '',
        has_other_pets: false,
        status: String(doc.status || 'pending').toUpperCase() as any,
        applied_at: doc.submittedAt || doc.$createdAt,
      }));

      set({ incomingApplications: mapped, isLoading: false });
    } catch (error) {
      console.warn('listOwnListingApplications warning:', error);
      set({ isLoading: false });
    }
  },

  submitApplication: async (data: Partial<AdoptionApplication>) => {
    set({ isLoading: true });
    try {
      const created = await adoptionApi.submitApplication(data);
      set({
        myApplications: [created, ...get().myApplications],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  listOwnPet: async (payload) => {
    set({ isLoading: true });
    try {
      await operate('listOwnPetForAdoption', payload);
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  reviewApplication: async (applicationId, decision) => {
    set({ isLoading: true });
    try {
      await operate('reviewOwnAdoption', { applicationId, decision });
      await get().fetchIncomingApplications();
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  confirmTransfer: async (applicationId) => {
    set({ isLoading: true });
    try {
      await operate('confirmAdoptionTransfer', { applicationId });
      await get().fetchIncomingApplications();
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  toggleListingVisibility: async (listingId) => {
    set({ isLoading: true });
    try {
      await operate('toggleListing', { listingId });
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));

export const useSurveillanceStore = create<SurveillanceState>((set) => ({
  activeAlerts: [],
  staffReports: [],
  incidentCategories: [],
  heatMapData: [],
  isLoading: false,

  fetchDiseaseAlerts: async () => {
    set({ isLoading: true });
    try {
      const alerts = await diseaseApi.getActiveAlerts();
      const coords = alerts.map((a) => ({
        latitude: a.lat,
        longitude: a.lng,
      }));
      set({
        activeAlerts: alerts,
        heatMapData: coords,
        isLoading: false,
      });
    } catch (error) {
      console.error('Appwrite fetchDiseaseAlerts error:', error);
      set({ isLoading: false });
    }
  },

  fetchIncidentCategories: async () => {
    try {
      const res = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.INCIDENT_CATEGORIES,
        [Query.equal('isActive', true), Query.limit(100)]
      );
      set({
        incidentCategories: res.documents as unknown as IncidentCategoryRow[],
      });
    } catch (error) {
      console.warn('Could not fetch incident_categories:', error);
    }
  },

  fetchStaffReports: async () => {
    set({ isLoading: true });
    try {
      // Cursor pagination avoids the old 100-record cutoff on backlogged reports.
      const all: IncidentReportRow[] = [];
      let cursor = '';
      for (let page = 0; page < 20; page++) {
        const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const result = await databases.listDocuments(APPWRITE_DATABASE_ID, TABLES.DISEASE_REPORTS, queries);
        const records = result.documents as unknown as IncidentReportRow[];
        all.push(...records);
        if (records.length < 100) break;
        cursor = records[records.length - 1].$id;
      }
      set({
        staffReports: all.filter(record => String(record.status || '').toLowerCase() !== 'archived'),
        isLoading: false,
      });
    } catch (error) {
      console.warn('Could not fetch staff disease_reports:', error);
      set({ isLoading: false });
    }
  },

  reportIncident: async (reportData: Partial<DiseaseAlert>) => {
    set({ isLoading: true });
    try {
      await diseaseApi.reportIncident(reportData);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));
```

## File: src/utils/constants.ts
```typescript
// Helper functions and UI constants
```

## File: src/theme.ts
```typescript
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAuthStore } from './store';

/** CityVetHub design tokens. The authenticated preference is the source of truth. */
export const LIGHT = {
  background: '#F2F5FA', surface: '#FFFFFF', surfaceMuted: '#EAF1FB',
  text: '#162337', secondary: '#62748A', border: '#DEE5EF',
  primary: '#3478F6', primaryMuted: '#EAF2FF', danger: '#C54552',
};
export const DARK = {
  background: '#101721', surface: '#1B2635', surfaceMuted: '#25364B',
  text: '#F3F7FC', secondary: '#ABBBD0', border: '#35465D',
  primary: '#76A8FF', primaryMuted: '#213A61', danger: '#FB8794',
};

export function useAppPalette() {
  const dark = useAuthStore(s => s.user?.theme === 'dark');
  return dark ? DARK : LIGHT;
}

/**
 * Adapt older light-only StyleSheet declarations without deleting their geometry.
 * Preserves meaningful warning, success, and primary colors; transforms neutral
 * backgrounds, borders, and foregrounds in dark mode.
 */
export function useThemedStyles<T extends Record<string, any>>(base: T): T {
  const dark = useAuthStore(s => s.user?.theme === 'dark');
  return useMemo(() => {
    if (!dark) return base;
    const normalized: Record<string, any> = {};
    const backgrounds: Record<string, string> = {
      '#FFFFFF': DARK.surface, '#F8FAFC': DARK.background,
      '#F9FAFB': DARK.background, '#F1F5F9': DARK.surfaceMuted,
      '#F3F4F6': DARK.surfaceMuted, '#F0F9FF': DARK.surfaceMuted,
      '#EFF6FF': DARK.primaryMuted, '#EAF2FF': DARK.primaryMuted,
      '#F8FAFF': DARK.background, '#E2E8F0': DARK.border,
      '#F5F7FB': DARK.background, '#F0F4F8': DARK.surfaceMuted,
      '#F7FAFC': DARK.background,
    };
    const foregrounds: Record<string, string> = {
      '#0F172A': DARK.text, '#1E293B': DARK.text, '#334155': DARK.text,
      '#475569': DARK.secondary, '#64748B': DARK.secondary,
      '#6B7280': DARK.secondary, '#64748b': DARK.secondary,
      '#94A3B8': DARK.secondary, '#111827': DARK.text,
      '#374151': DARK.text, '#4B5563': DARK.secondary,
      '#222222': DARK.text, '#333333': DARK.text,
      '#1F2937': DARK.text,
    };
    const borderColors: Record<string, string> = {
      '#E2E8F0': DARK.border, '#CBD5E1': DARK.border,
      '#E5E7EB': DARK.border, '#D1D5DB': DARK.border,
      '#F1F5F9': DARK.border, '#E0E7FF': DARK.border,
    };
    for (const [key, style] of Object.entries(base)) {
      const flat: any = StyleSheet.flatten(style) || {};
      const copy: Record<string, any> = { ...flat };
      for (const field of ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'color', 'placeholderTextColor']) {
        const v = copy[field];
        if (typeof v !== 'string') continue;
        const upper = v.toUpperCase();
        if (field === 'backgroundColor') {
          if (upper === '#1E293B' || upper === '#0F172A') copy[field] = '#172438';
          else if (backgrounds[upper]) copy[field] = backgrounds[upper];
        } else if (field === 'color' || field === 'placeholderTextColor') {
          if (foregrounds[upper]) copy[field] = foregrounds[upper];
          else if (upper === '#FFFFFF' && /(input|picker)/i.test(key)) copy[field] = DARK.text;
        } else if (borderColors[upper]) copy[field] = borderColors[upper];
      }
      normalized[key] = copy;
    }
    return normalized as T;
  }, [base, dark]);
}
```

## File: tests/verify_phase422.cjs
```javascript
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const get=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const has=(p,text)=>assert(get(p).includes(text),`${p} is missing ${text}`);
const files={
  'src/api/phase422.ts':['requirePhase422Backend','getAdoptionPreferences','saveAdoptionPreferences','markAdoptionMatchRead','getIncidentReportDetails','getBreedCatalog'],
  'src/screens/Adoption/AdoptionMatchesPanel.tsx':['Adoption matching','My match notifications','Save my preferences','readMatchNotification'],
  'src/screens/Officer/FieldIncidentScreen.tsx':['openReportDetails','getStaffIncidentDetails','reporterName','photoUrl'],
  'src/screens/Surveillance/DiseaseMap.tsx':['incidentPhoto','photoFileId','uploadMediaFile'],
  'src/screens/Profile/UserProfileScreen.tsx':['newPetColor','BreedPicker','applicantName'],
  'src/screens/Profile/OwnedPetPassportScreen.tsx':['editColor','BreedPicker'],
  'src/api/adoption.ts':['doc.sex || petDoc?.sex','petNameSnapshot','listingTitleSnapshot'],
  'src/store/index.ts':['listingTitleSnapshot','petNameSnapshot'],
};
for(const [name,needles] of Object.entries(files))for(const needle of needles)has(name,needle);
let ts;
try{ts=require('typescript');}
catch{throw new Error('TypeScript is not installed. Run npm ci before npm run verify:phase422.');}
let n=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isDirectory())walk(full);
  else if(/\.(tsx?|jsx?)$/.test(item.name)){
    const text=fs.readFileSync(full,'utf8');
    const output=ts.transpileModule(text,{fileName:full,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
    const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,`${item.name} failed to parse: ${errors.map(e=>e.messageText).join('; ')}`);
    n++;
  }
}}
walk(path.join(__dirname,'..','src'));
console.log(`PASS: 4.22.1 mobile feature wiring and ${n} source modules parsed. This does not replace a native device test.`);
```

## File: tests/verify_source.cjs
```javascript
// Static checks that do not require an Android emulator or live Appwrite credentials.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');
const sourceRoot = path.join(__dirname, '..');
const all = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (/\.[jt]sx?$/.test(file)) all.push(file);
  }
}
walk(path.join(sourceRoot, 'src'));
let diagnostics = [];
for (const file of all) {
  const src = fs.readFileSync(file, 'utf8');
  const parsed = ts.transpileModule(src, { fileName: file, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } });
  diagnostics.push(...(parsed.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error));
  const reg = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
  let m;
  while ((m = reg.exec(src))) {
    const stem = path.resolve(path.dirname(file), m[1]);
    assert(['.ts','.tsx','.js','.jsx','/index.ts','/index.tsx'].some(ext => fs.existsSync(stem + ext)),
      `Missing import ${m[1]} in ${file}`);
  }
}
assert.strictEqual(diagnostics.length, 0, diagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText, ' ')).join('\n'));
const read = file => fs.readFileSync(path.join(sourceRoot,file), 'utf8');
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('setTheme('));
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('Change profile picture'));
assert(read('src/screens/Profile/SettingsScreen.tsx').includes('Sign out'));
assert(read('src/screens/Surveillance/DiseaseMap.tsx').includes('<FullscreenMap'));
assert(read('src/screens/Officer/FieldIncidentScreen.tsx').includes('<FullscreenMap'));
assert(read('src/screens/Profile/OwnedPetPassportScreen.tsx').includes('ancestryParentId'));
assert(read('src/screens/Profile/UserProfileScreen.tsx').includes('newPetVitalStatus'));
assert(read('src/api/client.ts').includes('actualSize'));
assert(read('src/navigation/OfficerTabNavigator.tsx').includes('name="Settings"'));
assert(read('src/navigation/TabNavigator.tsx').includes('name="Settings"'));
assert(!read('src/screens/Officer/FieldLookupScreen.tsx').includes('onPress={() => logout()}'));
assert(read('src/api/client.ts').includes('EXPO_PUBLIC_APPWRITE_PROJECT_ID'));
console.log(`PASS: ${all.length} modules parse, imports resolve, settings / map / ancestry / upload checks passed.`);
```

## File: .env.example
```
# Public Appwrite identifiers only. NEVER put a secret API key in an EXPO_PUBLIC_ variable.
EXPO_PUBLIC_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
EXPO_PUBLIC_APPWRITE_PROJECT_ID=6aeff5c9002718442fdf
EXPO_PUBLIC_APPWRITE_DATABASE_ID=cityvethub
EXPO_PUBLIC_APPWRITE_FUNCTION_ID=cityvethub-operations
EXPO_PUBLIC_APPWRITE_MEDIA_BUCKET_ID=cityvethub-media
EXPO_PUBLIC_APPWRITE_OFFICER_TEAM_ID=cityvethub-field-officers
EXPO_PUBLIC_APPWRITE_ADMIN_TEAM_ID=cityvethub-admins
EXPO_PUBLIC_ANDROID_PACKAGE=com.cityvethub.iligan
# Must be an actual publicly reachable deployment of passport.html, never localhost for QR scanning
EXPO_PUBLIC_PUBLIC_PASSPORT_BASE_URL=https://REPLACE_WITH_YOUR_DEPLOYED_WEBSITE
```

## File: app.json
```json
{
  "expo": {
    "name": "CityVetHub",
    "slug": "cityvethub-mobile",
    "version": "1.2.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "package": "com.cityvethub.iligan"
    },
    "plugins": [
      "expo-secure-store",
      "expo-status-bar"
    ]
  }
}
```

## File: App.tsx
```typescript
import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store';
import { useAppPalette } from './src/theme';

export default function App() {
  const { isRestoring, refreshSession, user } = useAuthStore();
  const colors = useAppPalette();

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  if (isRestoring) {
    return (
      <SafeAreaProvider>
        <View style={[styles.splashContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color="#00AEEF" />
          <Text style={[styles.splashTitle, { color: colors.text }]}>City Vet Hub</Text>
          <Text style={styles.splashSub}>Restoring secure session...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={user?.theme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  splashSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6,
  },
});
```

## File: package.json
```json
{
  "name": "city-vet-hub-mobile",
  "version": "1.2.0",
  "dependencies": {
    "@react-native-picker/picker": "2.11.4",
    "@react-navigation/bottom-tabs": "^7.21.0",
    "@react-navigation/native": "^7.5.1",
    "@react-navigation/native-stack": "^7.21.0",
    "axios": "^1.21.0",
    "expo": "~58.0.23",
    "expo-camera": "~58.0.14",
    "expo-file-system": "~58.0.13",
    "expo-image-picker": "~58.0.10",
    "expo-secure-store": "~58.0.2",
    "expo-status-bar": "~58.0.4",
    "react": "19.3.0",
    "react-native": "0.88.1",
    "react-native-appwrite": "^3.2.0",
    "react-native-safe-area-context": "~5.11.1",
    "react-native-screens": "~4.30.1",
    "react-native-url-polyfill": "^4.0.0",
    "react-native-webview": "14.0.1",
    "zustand": "^5.0.16"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-native": "^0.72.8",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start --clear",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit",
    "verify:source": "node tests/verify_source.cjs",
    "verify:phase422": "node tests/verify_phase422.cjs"
  }
}
```

## File: README_PHASE422_MOBILE_UPDATE.md
```markdown
# CityVetHub consolidated release — 11 November 2026

## Contents
- `mobile/cityvethubmobile-main/`: source-only Android app v1.2.0, React Native / Expo SDK 58. No node_modules, no Appwrite secrets.
- `web/cityvethub_phase4_22/`: existing Phase 4.22 website, additive migrations and secure Appwrite Function with Phase 4.22.1 owner-adoption-history fix.
- `contract/`: consolidated mobile development contract, plus test/verification report.

## Important: NOT deployed, and not a prebuilt APK
This ZIP contains source code. The website and Android app were **not** deployed to Appwrite or built as an Android APK in this session. Working native push notifications cannot be verified until Android device-target registration, Appwrite Messaging, FCM and a development build are configured.

## Installation (Windows PowerShell)
1. Back up your existing Appwrite project/tables and current local project. Use the same Appwrite project and resource IDs.
2. Unzip this archive; open `web/cityvethub_phase4_22`. From PowerShell run `Set-ExecutionPolicy -Scope Process Bypass -Force` then `.\APPLY_PHASE4_22.ps1`. Follow the script's on-screen prompts with a temporary setup key. Never put keys in mobile `.env`.
3. Confirm Function `cityvethub-operations` reaches **Ready/Active**. `ping` must return build **4.22.1**. A queued deployment is not success. Revoke the temporary key.
4. Open `mobile/cityvethubmobile-main` in a second VS Code window. Run `npm ci`, copy `.env.example` to `.env`, configure your public passport website URL and registered Android package.
5. Run `npm run verify:source`, `npm run verify:phase422`, and `npm run typecheck`. Fix any errors that occur in your local environment. Run `npx expo start --go --clear` for ordinary UI testing. Native push requires a separate development build and provider registration.
6. Test Pet Owner, verified Pet Owner, approved Field Officer and website CVO Admin flows end to end against a test account. Confirm report photo upload, report detail, saved matching rules, notifications, listing history and transfer, QR, medical, Community, verification, staff registry.

## Important limitations
- Push notification preferences and **in-app notifications** are integrated; actual Android remote push delivery is *conditional* and still requires native setup, permissions, FCM/provider, and account device target registration. This source does not register targets automatically.
- Matching is triggered by newly published listings; it does not backfill every existing listing.
- Old adoption pet-name snapshots can only be recovered if some source record survives; the app must not invent deleted names.
- A source parser/import test is not equivalent to a full Android build, live Appwrite test or proof of production readiness.
- Re-running full initial database initialization is prohibited; this release is additive. Do not delete/recreate tables, owner data, legacy identifiers, or the original apps.
```

## File: README_PHASE5_MOBILE_REPAIR.md
```markdown
# CityVetHub Android — Phase 5 Mobile Repair

Source: user's uploaded `cityvethubmobile-main.zip` (React Native / Expo SDK 58).
This package modifies the mobile app only. It does **not** deploy or change Appwrite tables/functions.

## Install / run on Windows

1. Extract this ZIP. Open `cityvethubmobile-main` in VS Code.
2. Install Node.js 22 LTS or the version supported by your Expo SDK 58 toolchain.
3. Open PowerShell in the project root and run `npm ci` (or `npm install` if updating the lockfile).
4. Copy `.env.example` to `.env`. Set your deployed public passport website URL. Keep the other IDs if using the same Appwrite project.
5. In Appwrite Console, confirm Android platform `com.cityvethub.iligan` is registered, and `cityvethub-operations` is Ready/Active with the **Phase 4.21 or later** actions.
6. Run `npx expo start --go --clear`, scan QR in Expo Go (Android). Ensure phone and PC are on a reachable network; use `--tunnel` if needed.
7. Sign in with a **Pet Owner** or approved **Field Officer** account; Admin is website-only.

## Implemented repairs in this package

- New **Settings** tab for *both* mobile roles. Logout and theme selection have been moved here. Settings includes profile editing, avatar upload, contact number + dialer, password and email changes.
- Dark/light tokens with re-theming across existing screens and React Navigation, plus persisted Appwrite account preferences. Android status bar style follows account theme.
- Expo safe-area-aware auth pages, tab bars, settings and fullscreen map modal. Tab bars hide when Android keyboard is up.
- Dedicated **Maximize map** control on Pet Owner Incident screen and Field Officer Surveillance screen. Leaflet stays interactive with pin/coordinate selection and a safe-area-aware full-screen modal.
- Tap-to-call buttons in staff registry, adoption applications, owner applications, passport and Settings; buttons confirm before launching the native dialer.
- Pet **Ancestry + Vital Status**: add a pet with optional parent from same-species owned pets and `Alive` / `Deceased` / `Missing`, display current status/parent, update values later. Uses **Phase 4.21 backend** fields `ancestryParentId`, `ancestryParentName`, `vitalStatus` and Function actions `createInventoryPet`, `updateInventoryPet`, `updatePetDetails`. Server validates cycles, owner, species.
- Field Officer staff pet directory now prefers `getStaffPetDirectory` (a permission-checked Function) instead of owner-only rows. Supports image thumbnails supplied by Function, with an Appwrite direct-access fallback.
- Field Officer incident reports use Appwrite cursor pagination rather than truncating to the first 100. Archived reports do not contribute to active surveillance.
- Field Officer medical records request `resolveMedicalRecorders` when name snapshots are missing, so relevant staff identities can be displayed to authorized users.
- Profile photo uploader uses the **real image file size**, sanitizes the filename, relies on private default upload permissions, and attaches the photo through `saveProfileImage`. Owner photo rendering uses the authenticated SDK's file read and app-private cache, because plain `<Image uri=...>` does not send private Appwrite session credentials.
- Existing adoption, ownership transfer, verification, QR passport, community, private channels, staff alerts, role approval, pet medical uploads and signed-in sessions are preserved.

## Important limits / integration checks

- **Remote Android push notifications do not work inside Expo Go on SDK 58.** In-app alerts remain accessible. To add push delivery, use a custom Expo development build, `expo-notifications`, FCM and Appwrite Messaging registration/subscription. This codebase does not yet register device push tokens.
- The mobile app relies on the **existing Web backend** for sensitive actions and roles. `getStaffPetDirectory`, `resolveMedicalRecorders` and ancestry field support require deployed Phase 4.21+ Appwrite Function and schema. If the live Function is old, update the website backend first, *do not* create duplicate collections.
- Appwrite public project ID and resource IDs are included; **no secret server API keys** or admin credentials belong in the mobile app.
- A QR passport URL must point to a real, accessible web deployment; `localhost` cannot be scanned from another phone.
- UI/TS static checks were run, but npm dependencies could not be installed in this execution environment (npm registry DNS unavailable). **Expo Go device testing and a full `npm run typecheck` after installing dependencies are still required.**

## Acceptance-test walkthrough

1. Register Pet Owner -> log in -> My Pets -> create a pet with a photo, optional parent and status. Refresh -> verify values persist.
2. My Pets -> open pet passport -> update ancestry/status -> refresh from Appwrite. Invalid self-parenting should be rejected by backend.
3. Open QR profile and CVO verification flow; adoption listing, application, owner approval and transfer should remain functional.
4. Incident -> Maximize map -> choose pin -> close -> verify same coordinates before reporting. An unverified Pet Owner must still be blocked.
5. Community -> posts, images, comments, up/down voting, private channel membership, official notices.
6. Settings -> switch dark / light -> navigate across all tabs -> restart app -> preference should persist. Change avatar; new photo should appear immediately and after fresh login.
7. Sign out using Settings; no authenticated content should remain accessible. Login as approved Field Officer.
8. Officer Registry -> list/search verified pets, QR scan, medical records, add vaccination/treatment, inspect recorder names and contact dialer.
9. Officer Surveillance -> fullscreen map, report filtered by category, choose barangay, see backlog beyond 100 and exclude archived reports; Staff Alerts -> notices; Settings -> change profile photo / theme / logout.
10. Test Android gesture navigation, 3-button navigation, small phone, keyboard, landscape blocked per orientation config, and slow-network/offline errors.

## Appwrite connection identifiers (public, not secrets)

- Endpoint: `https://sgp.cloud.appwrite.io/v1`
- Project: `6aeff5c9002718442fdf`
- Database: `cityvethub`
- Function: `cityvethub-operations`
- Media bucket: `cityvethub-media`
- Officer Team: `cityvethub-field-officers`
- Administrator Team: `cityvethub-admins` (never a mobile UI role)

Use `npm run verify:source` for static parser/import checks; `npm run typecheck` after dependencies are installed.
```

## File: tsconfig.json
```json
{
  "compilerOptions": {},
  "extends": "expo/tsconfig.base"
}
```
