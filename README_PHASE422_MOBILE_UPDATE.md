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
