# CityVetHub Complete Database Schema

**Project ID:** `6aeff5c9002718442fdf`  
**Database ID:** `cityvethub`  
**Engine:** Appwrite TablesDB  
**Total Collections / Tables:** 27  
**Generated At:** 2026-11-12T16:02:47.796Z

---

## Table of Contents

1. [`pet_requests` — Pet Registration Requests](#pet_requests---pet-registration-requests)
2. [`pets` — Verified Pets](#pets---verified-pets)
3. [`medical_records` — Medical & Vaccination Records](#medical_records---medical-vaccination-records)
4. [`disease_reports` — Unverified Disease Reports](#disease_reports---unverified-disease-reports)
5. [`disease_incidents` — Confirmed Disease Incidents](#disease_incidents---confirmed-disease-incidents)
6. [`disease_alerts` — Official Outbreak Alerts](#disease_alerts---official-outbreak-alerts)
7. [`adoption_listings` — Adoption Listings](#adoption_listings---adoption-listings)
8. [`adoption_applications` — Adoption Applications](#adoption_applications---adoption-applications)
9. [`ownership_history` — Ownership History](#ownership_history---ownership-history)
10. [`user_profiles` — Private User Profiles](#user_profiles---private-user-profiles)
11. [`pet_profiles` — Personal Pet Inventory](#pet_profiles---personal-pet-inventory)
12. [`pet_passports` — Public Verified Pet Passports](#pet_passports---public-verified-pet-passports)
13. [`incident_categories` — Incident Categories](#incident_categories---incident-categories)
14. [`pet_health_uploads` — Private Owner Health Uploads](#pet_health_uploads---private-owner-health-uploads)
15. [`pet_passport_medical` — Owner-Shared Public Pet Documents](#pet_passport_medical---owner-shared-public-pet-documents)
16. [`pet_registry_ids` — Reserved Unique CVO Pet IDs](#pet_registry_ids---reserved-unique-cvo-pet-ids)
17. [`outbreak_owner_notifications` — Owner-visible CVO outbreak and health notifications](#outbreak_owner_notifications---owner-visible-cvo-outbreak-and-health-notifications)
18. [`id_categories` — Government ID Categories](#id_categories---government-id-categories)
19. [`owner_verification_requests` — Private Pet Owner Account Verification Requests](#owner_verification_requests---private-pet-owner-account-verification-requests)
20. [`community_channels` — Community Channels](#community_channels---community-channels)
21. [`community_memberships` — Community Channel Memberships](#community_memberships---community-channel-memberships)
22. [`community_posts` — Community Discussions](#community_posts---community-discussions)
23. [`community_comments` — Community Comments](#community_comments---community-comments)
24. [`community_votes` — Community Votes](#community_votes---community-votes)
25. [`community_announcements` — CVO Official Community Announcements](#community_announcements---cvo-official-community-announcements)
26. [`pet_match_preferences` — Private Adoption Matching Preferences](#pet_match_preferences---private-adoption-matching-preferences)
27. [`pet_match_notifications` — Private Adoption Match Notifications](#pet_match_notifications---private-adoption-match-notifications)

---

## Collections & Attributes

### `pet_requests` — Pet Registration Requests

- **Collection / Table ID:** `pet_requests`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | Yes | No | size: 64 | - |
| `ownerName` | `string` | Yes | No | size: 128 | - |
| `petName` | `string` | Yes | No | size: 100 | - |
| `species` | `string` | Yes | No | size: 10 | - |
| `breed` | `string` | Yes | No | size: 100 | - |
| `sex` | `string` | Yes | No | size: 10 | - |
| `ageYears` | `integer` | Yes | No | min: 0, max: 40 | - |
| `barangay` | `string` | Yes | No | size: 100 | - |
| `reviewStatus` | `string` | Yes | No | size: 16 | - |
| `petProfileId` | `string` | No | No | size: 36 | - |

### `pets` — Verified Pets

- **Collection / Table ID:** `pets`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | Yes | No | size: 64 | - |
| `ownerName` | `string` | Yes | No | size: 128 | - |
| `petName` | `string` | Yes | No | size: 100 | - |
| `species` | `string` | Yes | No | size: 10 | - |
| `breed` | `string` | Yes | No | size: 100 | - |
| `sex` | `string` | Yes | No | size: 10 | - |
| `ageYears` | `integer` | Yes | No | min: 0, max: 40 | - |
| `barangay` | `string` | Yes | No | size: 100 | - |
| `requestId` | `string` | Yes | No | size: 36 | - |
| `petProfileId` | `string` | No | No | size: 36 | - |
| `homeAddress` | `string` | No | No | size: 200 | - |
| `photoFileId` | `string` | No | No | size: 36 | - |
| `lostFoundMessage` | `string` | No | No | size: 500 | - |
| `emergencyContact` | `string` | No | No | size: 60 | - |
| `sharePublicAddress` | `boolean` | No | No | - | - |
| `shareContact` | `boolean` | No | No | - | - |
| `vaccinationStatus` | `string` | No | No | size: 100 | - |
| `officialRegistryId` | `string` | No | No | size: 30 | - |

### `medical_records` — Medical & Vaccination Records

- **Collection / Table ID:** `medical_records`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `petId` | `string` | Yes | No | size: 36 | - |
| `veterinarianId` | `string` | Yes | No | size: 36 | - |
| `recordType` | `string` | Yes | No | size: 20 | - |
| `medicineType` | `string` | Yes | No | size: 100 | - |
| `description` | `string` | No | No | size: 1000 | - |
| `dateAdministered` | `datetime` | Yes | No | - | - |
| `recorderNameSnapshot` | `string` | No | No | size: 128 | - |
| `expiryDate` | `text` | No | No | - | - |

### `disease_reports` — Unverified Disease Reports

- **Collection / Table ID:** `disease_reports`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `reportedById` | `string` | Yes | No | size: 36 | - |
| `diseaseType` | `string` | Yes | No | size: 60 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `latitude` | `double` | Yes | No | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | - |
| `longitude` | `double` | Yes | No | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | - |
| `description` | `string` | No | No | size: 1000 | - |
| `status` | `string` | Yes | No | size: 16 | - |
| `reportedAt` | `datetime` | Yes | No | - | - |
| `reporterRole` | `string` | No | No | size: 20 | - |
| `photoFileId` | `string` | No | No | size: 36 | - |

### `disease_incidents` — Confirmed Disease Incidents

- **Collection / Table ID:** `disease_incidents`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `reportId` | `string` | Yes | No | size: 36 | - |
| `diseaseType` | `string` | Yes | No | size: 60 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `latitude` | `double` | Yes | No | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | - |
| `longitude` | `double` | Yes | No | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | - |
| `confirmedById` | `string` | Yes | No | size: 36 | - |
| `confirmedAt` | `datetime` | Yes | No | - | - |

### `disease_alerts` — Official Outbreak Alerts

- **Collection / Table ID:** `disease_alerts`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `title` | `string` | Yes | No | size: 120 | - |
| `message` | `string` | Yes | No | size: 1500 | - |
| `diseaseType` | `string` | Yes | No | size: 60 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `severity` | `string` | Yes | No | size: 10 | - |
| `issuedById` | `string` | Yes | No | size: 36 | - |
| `issuedAt` | `datetime` | Yes | No | - | - |
| `isActive` | `boolean` | Yes | No | - | - |
| `isOutbreak` | `boolean` | No | No | - | - |
| `notifyOwners` | `boolean` | No | No | - | - |

### `adoption_listings` — Adoption Listings

- **Collection / Table ID:** `adoption_listings`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `petId` | `string` | Yes | No | size: 36 | - |
| `title` | `string` | Yes | No | size: 150 | - |
| `description` | `string` | No | No | size: 1500 | - |
| `requirements` | `string` | No | No | size: 1000 | - |
| `species` | `string` | No | No | size: 10 | - |
| `breed` | `string` | No | No | size: 100 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `activityLevel` | `string` | No | No | size: 12 | - |
| `housingRequirement` | `string` | No | No | size: 16 | - |
| `status` | `string` | Yes | No | size: 20 | - |
| `postedById` | `string` | Yes | No | size: 36 | - |
| `isActive` | `boolean` | Yes | No | - | - |
| `petProfileId` | `string` | No | No | size: 36 | - |
| `verificationStatus` | `string` | No | No | size: 20 | - |
| `photoFileId` | `string` | No | No | size: 36 | - |
| `ownerAvatarFileId` | `string` | No | No | size: 36 | - |
| `ownerDisplayName` | `string` | No | No | size: 128 | - |
| `color` | `string` | No | No | size: 50 | - |
| `sex` | `string` | No | No | size: 20 | - |
| `ageYears` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |

### `adoption_applications` — Adoption Applications

- **Collection / Table ID:** `adoption_applications`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `listingId` | `string` | Yes | No | size: 36 | - |
| `petId` | `string` | Yes | No | size: 36 | - |
| `applicantId` | `string` | Yes | No | size: 36 | - |
| `applicantName` | `string` | Yes | No | size: 128 | - |
| `message` | `string` | Yes | No | size: 1000 | - |
| `status` | `string` | Yes | No | size: 20 | - |
| `submittedAt` | `datetime` | Yes | No | - | - |
| `contactNumber` | `string` | No | No | size: 40 | - |
| `petProfileIdSnapshot` | `string` | No | No | size: 36 | - |
| `petNameSnapshot` | `string` | No | No | size: 100 | - |
| `listingTitleSnapshot` | `string` | No | No | size: 150 | - |

### `ownership_history` — Ownership History

- **Collection / Table ID:** `ownership_history`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `petId` | `string` | Yes | No | size: 36 | - |
| `previousOwnerId` | `string` | Yes | No | size: 36 | - |
| `newOwnerId` | `string` | Yes | No | size: 36 | - |
| `transferType` | `string` | Yes | No | size: 40 | - |
| `transferDate` | `datetime` | Yes | No | - | - |
| `previousOwnerName` | `string` | No | No | size: 128 | - |
| `newOwnerName` | `string` | No | No | size: 128 | - |
| `petName` | `text` | No | No | - | - |

### `user_profiles` — Private User Profiles

- **Collection / Table ID:** `user_profiles`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `userId` | `string` | No | No | size: 36 | - |
| `fullName` | `string` | No | No | size: 128 | - |
| `phone` | `string` | No | No | size: 40 | - |
| `address` | `string` | No | No | size: 200 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `profileImageId` | `string` | No | No | size: 36 | - |
| `position` | `string` | No | No | size: 100 | - |
| `employeeId` | `string` | No | No | size: 60 | - |
| `assignedArea` | `string` | No | No | size: 100 | - |
| `shareAvatarOnListings` | `boolean` | No | No | - | - |
| `accountVerificationStatus` | `string` | No | No | size: 20 | - |

### `pet_profiles` — Personal Pet Inventory

- **Collection / Table ID:** `pet_profiles`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | No | No | size: 36 | - |
| `petName` | `string` | No | No | size: 100 | - |
| `species` | `string` | No | No | size: 10 | - |
| `breed` | `string` | No | No | size: 100 | - |
| `sex` | `string` | No | No | size: 10 | - |
| `ageYears` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `homeAddress` | `string` | No | No | size: 200 | - |
| `photoFileId` | `string` | No | No | size: 36 | - |
| `lostFoundMessage` | `string` | No | No | size: 500 | - |
| `emergencyContact` | `string` | No | No | size: 60 | - |
| `sharePublicAddress` | `boolean` | No | No | - | - |
| `shareContact` | `boolean` | No | No | - | - |
| `verificationStatus` | `string` | No | No | size: 20 | - |
| `latestRequestId` | `string` | No | No | size: 36 | - |
| `profileTitle` | `string` | No | No | size: 100 | - |
| `profileDescription` | `string` | No | No | size: 1500 | - |
| `shareOwnerName` | `boolean` | No | No | - | - |
| `sharePublicPhoto` | `boolean` | No | No | - | - |
| `vaccinationStatus` | `string` | No | No | size: 100 | - |
| `officialRegistryId` | `string` | No | No | size: 30 | - |
| `ancestry` | `text` | No | No | - | - |
| `vitalStatus` | `enum (Alive, Deceased, Missing)` | No | No | - | - |
| `ancestryParentId` | `string` | No | No | size: 36 | - |
| `ancestryParentName` | `string` | No | No | size: 100 | - |
| `color` | `string` | No | No | size: 50 | - |
| `ancestryParent2Id` | `text` | No | No | - | - |
| `ancestryParent2Name` | `text` | No | No | - | - |

### `pet_passports` — Public Verified Pet Passports

- **Collection / Table ID:** `pet_passports`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `petId` | `string` | No | No | size: 36 | - |
| `petName` | `string` | No | No | size: 100 | - |
| `species` | `string` | No | No | size: 10 | - |
| `breed` | `string` | No | No | size: 100 | - |
| `sex` | `string` | No | No | size: 10 | - |
| `ageYears` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `ownerName` | `string` | No | No | size: 128 | - |
| `displayAddress` | `string` | No | No | size: 200 | - |
| `contact` | `string` | No | No | size: 60 | - |
| `lostFoundMessage` | `string` | No | No | size: 500 | - |
| `photoFileId` | `string` | No | No | size: 36 | - |
| `vaccinationStatus` | `string` | No | No | size: 100 | - |
| `profileTitle` | `string` | No | No | size: 100 | - |
| `profileDescription` | `string` | No | No | size: 1500 | - |
| `verificationStatus` | `string` | No | No | size: 20 | - |
| `officialRegistryId` | `string` | No | No | size: 30 | - |

### `incident_categories` — Incident Categories

- **Collection / Table ID:** `incident_categories`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `name` | `string` | No | No | size: 60 | - |
| `description` | `string` | No | No | size: 240 | - |
| `isActive` | `boolean` | No | No | - | - |
| `createdById` | `string` | No | No | size: 36 | - |

### `pet_health_uploads` — Private Owner Health Uploads

- **Collection / Table ID:** `pet_health_uploads`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | No | No | size: 36 | - |
| `petProfileId` | `string` | No | No | size: 36 | - |
| `title` | `string` | No | No | size: 120 | - |
| `recordDate` | `datetime` | No | No | - | - |
| `fileId` | `string` | No | No | size: 36 | - |
| `sharePublic` | `boolean` | No | No | - | - |
| `expiryDate` | `text` | No | No | - | - |

### `pet_passport_medical` — Owner-Shared Public Pet Documents

- **Collection / Table ID:** `pet_passport_medical`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `petProfileId` | `string` | No | No | size: 36 | - |
| `title` | `string` | No | No | size: 120 | - |
| `recordDate` | `datetime` | No | No | - | - |
| `fileId` | `string` | No | No | size: 36 | - |
| `sourceLabel` | `string` | No | No | size: 100 | - |
| `expiryDate` | `text` | No | No | - | - |

### `pet_registry_ids` — Reserved Unique CVO Pet IDs

- **Collection / Table ID:** `pet_registry_ids`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `requestId` | `string` | No | No | size: 36 | - |
| `assignedById` | `string` | No | No | size: 36 | - |

### `outbreak_owner_notifications` — Owner-visible CVO outbreak and health notifications

- **Collection / Table ID:** `outbreak_owner_notifications`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `sourceAlertId` | `string` | No | No | size: 36 | - |
| `title` | `string` | No | No | size: 120 | - |
| `message` | `string` | No | No | size: 1500 | - |
| `diseaseType` | `string` | No | No | size: 60 | - |
| `barangay` | `string` | No | No | size: 100 | - |
| `severity` | `string` | No | No | size: 10 | - |
| `issuedById` | `string` | No | No | size: 36 | - |
| `issuedAt` | `datetime` | No | No | - | - |
| `isActive` | `boolean` | No | No | - | - |
| `isOutbreak` | `boolean` | No | No | - | - |

### `id_categories` — Government ID Categories

- **Collection / Table ID:** `id_categories`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `name` | `string` | No | No | size: 90 | - |
| `description` | `string` | No | No | size: 240 | - |
| `isActive` | `boolean` | No | No | - | - |
| `createdById` | `string` | No | No | size: 36 | - |
| `categoryCode` | `string` | No | No | size: 40 | - |
| `categoryType` | `string` | No | No | size: 20 | - |

### `owner_verification_requests` — Private Pet Owner Account Verification Requests

- **Collection / Table ID:** `owner_verification_requests`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | No | No | size: 36 | - |
| `petProfileId` | `string` | No | No | size: 36 | - |
| `idCategoryId` | `string` | No | No | size: 36 | - |
| `idCategoryName` | `string` | No | No | size: 90 | - |
| `documentFileId` | `string` | No | No | size: 36 | - |
| `status` | `string` | No | No | size: 20 | - |
| `reviewNote` | `string` | No | No | size: 500 | - |
| `submittedAt` | `datetime` | No | No | - | - |
| `reviewedById` | `string` | No | No | size: 36 | - |

### `community_channels` — Community Channels

- **Collection / Table ID:** `community_channels`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `name` | `string` | No | No | size: 80 | - |
| `description` | `string` | No | No | size: 300 | - |
| `privacy` | `string` | No | No | size: 12 | - |
| `createdById` | `string` | No | No | size: 36 | - |
| `createdByName` | `string` | No | No | size: 128 | - |
| `isArchived` | `boolean` | No | No | - | - |

### `community_memberships` — Community Channel Memberships

- **Collection / Table ID:** `community_memberships`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `channelId` | `string` | No | No | size: 36 | - |
| `userId` | `string` | No | No | size: 36 | - |
| `userName` | `string` | No | No | size: 128 | - |
| `status` | `string` | No | No | size: 12 | - |
| `requestedAt` | `datetime` | No | No | - | - |
| `reviewedAt` | `datetime` | No | No | - | - |

### `community_posts` — Community Discussions

- **Collection / Table ID:** `community_posts`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `channelId` | `string` | No | No | size: 36 | - |
| `authorId` | `string` | No | No | size: 36 | - |
| `authorName` | `string` | No | No | size: 128 | - |
| `title` | `string` | No | No | size: 140 | - |
| `body` | `string` | No | No | size: 5000 | - |
| `imageFileIds` | `string` | No | No | size: 800 | - |
| `isDeleted` | `boolean` | No | No | - | - |
| `authorRole` | `text` | No | No | - | - |

### `community_comments` — Community Comments

- **Collection / Table ID:** `community_comments`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `channelId` | `string` | No | No | size: 36 | - |
| `postId` | `string` | No | No | size: 36 | - |
| `parentCommentId` | `string` | No | No | size: 36 | - |
| `authorId` | `string` | No | No | size: 36 | - |
| `authorName` | `string` | No | No | size: 128 | - |
| `body` | `string` | No | No | size: 2000 | - |
| `isDeleted` | `boolean` | No | No | - | - |
| `authorRole` | `text` | No | No | - | - |

### `community_votes` — Community Votes

- **Collection / Table ID:** `community_votes`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `channelId` | `string` | No | No | size: 36 | - |
| `targetType` | `string` | No | No | size: 10 | - |
| `targetId` | `string` | No | No | size: 36 | - |
| `userId` | `string` | No | No | size: 36 | - |
| `value` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |

### `community_announcements` — CVO Official Community Announcements

- **Collection / Table ID:** `community_announcements`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `title` | `string` | No | No | size: 140 | - |
| `body` | `string` | No | No | size: 2000 | - |
| `audience` | `string` | No | No | size: 12 | - |
| `isActive` | `boolean` | No | No | - | - |
| `issuedById` | `string` | No | No | size: 36 | - |
| `publishedAt` | `datetime` | No | No | - | - |

### `pet_match_preferences` — Private Adoption Matching Preferences

- **Collection / Table ID:** `pet_match_preferences`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | No | No | size: 36 | - |
| `species` | `string` | No | No | size: 12 | - |
| `breed` | `string` | No | No | size: 100 | - |
| `color` | `string` | No | No | size: 50 | - |
| `sex` | `string` | No | No | size: 12 | - |
| `minAgeYears` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |
| `maxAgeYears` | `integer` | No | No | min: -9223372036854776000, max: 9223372036854776000 | - |
| `isEnabled` | `boolean` | No | No | - | - |
| `pushEnabled` | `boolean` | No | No | - | - |

### `pet_match_notifications` — Private Adoption Match Notifications

- **Collection / Table ID:** `pet_match_notifications`
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Enabled:** Yes

| Attribute Name | Type | Required | Array | Details / Constraints | Default |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `ownerId` | `string` | No | No | size: 36 | - |
| `listingId` | `string` | No | No | size: 36 | - |
| `petName` | `string` | No | No | size: 100 | - |
| `title` | `string` | No | No | size: 150 | - |
| `createdAt` | `datetime` | No | No | - | - |
| `isRead` | `boolean` | No | No | - | - |
| `pushStatus` | `string` | No | No | size: 20 | - |

