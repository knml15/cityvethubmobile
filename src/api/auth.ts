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
  PUBLIC_PASSPORT_BASE_URL,
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

    if (prefs.requireEmailVerification && !appwriteUser.emailVerification) {
      const verifyUrl = `${PUBLIC_PASSPORT_BASE_URL.replace(/\/+$/, '')}/login.html`;
      await account
        .createVerification(verifyUrl)
        .catch((e) => console.warn('Email verification notice:', e));
      await account.deleteSession('current').catch(() => {});
      throw new Error(
        'Please verify your email address before signing in. A verification link has been sent to your email inbox.'
      );
    }

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
   * Alias matching web `getCurrentAuthoritativeContext` for authoritative session & email verification checks.
   */
  getCurrentAuthoritativeContext: async (): Promise<CitizenProfile> => {
    return authApi.resolveCurrentUser();
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

    const verifyUrl = `${PUBLIC_PASSPORT_BASE_URL.replace(/\/+$/, '')}/login.html`;
    await account
      .createVerification(verifyUrl)
      .catch((e) => console.warn('Email verification notice:', e));

    // 2. Save role & theme prefs
    await account.updatePrefs({
      requestedRole: params.requestedRole,
      requireEmailVerification: true,
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
   * If the user's `user_profiles` row does not exist yet (e.g. newly approved Officer),
   * initializes the profile row first via `saveProfile` and retries `saveProfileImage`.
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
      const msg = String(err?.message || '');
      if (
        msg.toLowerCase().includes('could not be found') ||
        msg.toLowerCase().includes('not found') ||
        msg.includes('404')
      ) {
        // Initialize missing user_profiles row first, then attach the uploaded avatar
        const current = await authApi.resolveCurrentUser();
        await operate('saveProfile', {
          fullName: current.fullName || 'CityVetHub User',
          phone: current.contactNumber || '09000000000',
          address: current.address || `Brgy. ${current.barangay}, Iligan City`,
          barangay: normalizeBarangay(current.barangay),
          ...(current.contractRole === 'officer'
            ? {
                position: current.position || 'Field Officer',
                employeeId: current.employeeId || 'CVO-OFFICER',
                assignedArea: normalizeBarangay(
                  current.assignedArea || current.barangay
                ),
              }
            : {}),
        });
        await operate('saveProfileImage', { profileImageId: fileId });
      } else {
        throw new Error(
          msg || 'Unable to update your profile photo. Please try again.'
        );
      }
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