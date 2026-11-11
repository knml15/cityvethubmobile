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
