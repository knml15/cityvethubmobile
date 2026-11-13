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
  'https://cityvethub.appwrite.network';
export const APPWRITE_PUSH_PROVIDER_ID =
  process.env.EXPO_PUBLIC_APPWRITE_PUSH_PROVIDER_ID || '6af4f83a002e01081d64';

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

export const READ_ONLY_ACTIONS = [
  'ping',
  'getBreedCatalog',
  'communityOverview',
  'communityChannel',
  'communityComments',
  'communitySearch',
  'communityImageToken',
  'communityAvatarTokens',
  'communityOfficialNotices',
  'communityNotifications',
  'getStaffPetDirectory',
  'resolveMedicalRecorders',
  'listOwnListingApplications',
  'getAdoptionPreferences',
  'resolveAdoptionApplicationNames',
  'listUsers',
  'openVerificationDocument',
  'resolveReporterRoles',
  'getIncidentReportDetails',
  'ensurePetPassport',
  'communityJoinRequests',
];

type DataChangedListener = (action: string) => void;
const dataChangedListeners = new Set<DataChangedListener>();

export function subscribeDataChanged(
  listener: DataChangedListener
): () => void {
  dataChangedListeners.add(listener);
  return () => {
    dataChangedListeners.delete(listener);
  };
}

export function emitDataChanged(action: string): void {
  for (const listener of dataChangedListeners) {
    try {
      listener(action);
    } catch {
      // Ignore individual listener errors
    }
  }
}

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
    throw new Error(
      parsedBody?.error ||
        'Unable to complete the request right now. Please try again.'
    );
  }

  if (!READ_ONLY_ACTIONS.includes(action)) {
    emitDataChanged(action);
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