# CityVetHub Mobile (React Native / Expo) — Master Agent Contract

## 1. Role & Scope Invariants (Strict Thesis & CVO Protocol)
- **Mobile Roles Only:** Only **Pet Owner (`owner`)** and **Field Officer (`officer`)** may use the mobile app. **CVO Administrator (`admin`)** is strictly Web-Only (`src/api/auth.ts` blocks admin-only logins).
- **Pending Field Officers:** Accounts with `prefs.requestedRole === 'officer'` that are NOT yet members of Team `cityvethub-field-officers` must invoke `operate('blockPendingOfficer')` and sign out immediately.
- **Email Verification Gate:** Accounts with `prefs.requireEmailVerification && !emailVerification` must send a verification email and sign out before accessing protected screens.
- **Spatial Surveillance Privacy:** Pet Owners (`owner`) can ONLY submit geotagged incident reports (`DiseaseMap.tsx`) and must NEVER see other citizens' incident pins, heatmaps, or `disease_alerts`. Only `officer` can view `FieldIncidentScreen.tsx` and `OcularQueueScreen.tsx`.

## 2. Mobile Codebase Map (Do Not Guess File Paths)
- **Appwrite Client & Live Event Bus:** `src/api/client.ts` (`operate`, `uploadMediaFile`, `getOwnedImageUri`, `getMediaFileUrl`, `subscribeDataChanged`, `emitDataChanged`, `TABLES`).
- **Auth & Verification API:** `src/api/auth.ts` (`resolveCurrentUser`, `registerAccount`, `saveProfile`, `uploadAndSaveAvatar`, `submitAccountVerification`, `replaceVerificationDocument`).
- **Adoption API:** `src/api/adoption.ts` (`getAvailablePets`, `submitApplication`, `getMyApplications` with `resolveAdoptionApplicationNames`).
- **Phase 4.22 Matching & Staff Incident Details:** `src/api/phase422.ts` (`getMatchPreferences`, `saveMatchPreferences`, `getMatchNotifications`, `readMatchNotification`, `fetchBreedCatalog`, `getStaffIncidentDetails`).
- **Zustand Stores:** `src/store/index.ts` (`useAuthStore`, `useAdoptionStore`, `useSurveillanceStore` — all fetch actions support `silent?: boolean`).
- **Live Sync Hook:** `src/utils/useLiveSync.ts` (`useLiveSync(refreshFn, { enabled, intervalMs })` — pauses automatically when modals are open).
- **Push Notifications:** `src/utils/pushNotifications.ts` (`registerDevicePushTarget` using native FCM token via `Notifications.getDevicePushTokenAsync()`).
- **Global Components:**
  - `src/components/NotificationBell.tsx` (Unified Notification Center for Owner & Officer, synced via `subscribeDataChanged` + 15s silent poll).
  - `src/components/BreedPicker.tsx`, `src/components/CallButton.tsx`, `src/components/FullscreenMap.tsx`.
- **Pet Owner Screens (`TabNavigator.tsx`):**
  - `src/screens/Adoption/AdoptionFeed.tsx`, `src/screens/Adoption/AdoptionMatchesPanel.tsx`, `src/screens/Adoption/PetDetailScreen.tsx`.
  - `src/screens/Surveillance/DiseaseMap.tsx` (Confidential pin-drop incident reporting).
  - `src/screens/Community/CommunityScreen.tsx` (Discussions, Channels, Official CVO Notices).
  - `src/screens/Profile/UserProfileScreen.tsx` (My Pets, Adoptions incoming/outgoing, ID Verify).
  - `src/screens/Profile/OwnedPetPassportScreen.tsx` (QR Passport, Edit Pet, 2-Parent Ancestry, Health Uploads, List for Adoption).
  - `src/screens/Profile/SettingsScreen.tsx` (Shared Owner/Officer account, avatar, theme, password/email security).
- **Field Officer Screens (`OfficerTabNavigator.tsx`):**
  - `src/screens/Officer/FieldLookupScreen.tsx` (QR Scanner, `getStaffPetDirectory` lookup, `addMedical` with vaccine presets & `expiryDate`).
  - `src/screens/Officer/FieldIncidentScreen.tsx` (Barangay report volume map: 1-2 Green, 3-10 Yellow, 11+ Red; `getIncidentReportDetails`).
  - `src/screens/Officer/OcularQueueScreen.tsx` (Staff `disease_alerts` + `communityOfficialNotices`).

## 3. Backend `operate(action, payload)` Contract (`cityvethub-operations` Build >= 4.22.0)
- **Never Query Community Tables Directly:** `community_channels`, `community_memberships`, `community_posts`, `community_comments`, `community_votes`, and `community_announcements` are Function-only. Always use `operate('community*', payload)`.
- **No Raw WebSockets (`client.subscribe`):** Do NOT use Appwrite Realtime WebSockets on mobile (causes 401 errors on Function-gated tables). Always use `useLiveSync` (`src/utils/useLiveSync.ts`).
- **Key Mutation & Read Actions:**
  - Profile/Auth: `saveProfile`, `saveProfileImage`, `setProfilePhotoSharing`, `requestAccountVerification`, `replaceVerificationDocument`, `blockPendingOfficer`.
  - Pets & Passports: `createInventoryPet`, `updateInventoryPet` (works on both unverified and verified pets, syncing `pets`, `pet_passports`, and active `adoption_listings`), `updatePetDetails`, `deleteInventoryPet` (draft/rejected only), `requestPetVerification`, `ensurePetPassport`, `addPetHealthUpload` (supports `expiryDate`), `deletePetHealthUpload`.
  - Medical & Officer: `getStaffPetDirectory` (returns both verified `pets` and unverified `pet_profiles`), `addMedical` (works on both verified and unverified pets, supports `expiryDate` and `[Exp: YYYY-MM-DD]`), `resolveMedicalRecorders`, `getIncidentReportDetails`, `submitDisease`.
  - Adoptions & Matching: `listOwnPetForAdoption`, `updateListingPhotos`, `toggleListing`, `applyAdoption`, `listOwnListingApplications`, `reviewOwnAdoption` (`approve` | `decline`), `confirmAdoptionTransfer`, `resolveAdoptionApplicationNames`, `getAdoptionPreferences`, `saveAdoptionPreferences`, `markAdoptionMatchRead`.
  - Community: `communityOverview`, `communityOfficialNotices`, `communityNotifications`, `communityChannel`, `communityCreateChannel`, `communitySetPrivacy`, `communityDeleteChannel`, `communityRequestJoin`, `communityJoinRequests`, `communityReviewJoin`, `communityCreatePost`, `communityDeletePost`, `communityComments`, `communityCreateComment`, `communityDeleteComment`, `communityVote`, `communityImageToken`, `communitySearch`.
- **Full Database Schema:** Reference `@[docs/full_schema.md](docs/full_schema.md)` for all 27 table IDs and column constraints.

## 4. UI/UX & Verification Standards
- Always use `useAppPalette()` and `useThemedStyles(baseStyles)` from `src/theme.ts` so Light and Dark mode work seamlessly.
- Background refreshes (`silent = true`) must NEVER trigger full-screen spinners or reset scroll positions, and must pause while modals are open.
- **Mandatory Verification Commands (Run after every edit):**
  1. `npm run typecheck`
  2. `npm run verify:source`
  3. `npm run verify:phase422`