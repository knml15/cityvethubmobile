# CityVetHub Appwrite Database Schema

> Complete database schema export generated directly from the Appwrite MCP Server.

## Database Overview

| Property | Value |
| :--- | :--- |
| **Project ID** | `6aeff5c9002718442fdf` |
| **Database ID** | `cityvethub` |
| **Database Name** | `CityVetHub` |
| **Total Collections** | 27 |
| **Export Date** | 2026-11-11T21:53:29.299Z |

## Collections Summary Table

| # | Collection ID | Display Name | Attributes Count | Row Security |
| :---: | :--- | :--- | :---: | :---: |
| 1 | [pet_requests](#pet_requests) | Pet Registration Requests | 10 | Enabled |
| 2 | [pets](#pets) | Verified Pets | 18 | Enabled |
| 3 | [medical_records](#medical_records) | Medical & Vaccination Records | 8 | Enabled |
| 4 | [disease_reports](#disease_reports) | Unverified Disease Reports | 10 | Enabled |
| 5 | [disease_incidents](#disease_incidents) | Confirmed Disease Incidents | 7 | Enabled |
| 6 | [disease_alerts](#disease_alerts) | Official Outbreak Alerts | 10 | Enabled |
| 7 | [adoption_listings](#adoption_listings) | Adoption Listings | 20 | Enabled |
| 8 | [adoption_applications](#adoption_applications) | Adoption Applications | 11 | Enabled |
| 9 | [ownership_history](#ownership_history) | Ownership History | 8 | Enabled |
| 10 | [user_profiles](#user_profiles) | Private User Profiles | 11 | Enabled |
| 11 | [pet_profiles](#pet_profiles) | Personal Pet Inventory | 28 | Enabled |
| 12 | [pet_passports](#pet_passports) | Public Verified Pet Passports | 17 | Enabled |
| 13 | [incident_categories](#incident_categories) | Incident Categories | 4 | Enabled |
| 14 | [pet_health_uploads](#pet_health_uploads) | Private Owner Health Uploads | 7 | Enabled |
| 15 | [pet_passport_medical](#pet_passport_medical) | Owner-Shared Public Pet Documents | 6 | Enabled |
| 16 | [pet_registry_ids](#pet_registry_ids) | Reserved Unique CVO Pet IDs | 2 | Enabled |
| 17 | [outbreak_owner_notifications](#outbreak_owner_notifications) | Owner-visible CVO outbreak and health notifications | 10 | Enabled |
| 18 | [id_categories](#id_categories) | Government ID Categories | 6 | Enabled |
| 19 | [owner_verification_requests](#owner_verification_requests) | Private Pet Owner Account Verification Requests | 9 | Enabled |
| 20 | [community_channels](#community_channels) | Community Channels | 6 | Enabled |
| 21 | [community_memberships](#community_memberships) | Community Channel Memberships | 6 | Enabled |
| 22 | [community_posts](#community_posts) | Community Discussions | 8 | Enabled |
| 23 | [community_comments](#community_comments) | Community Comments | 8 | Enabled |
| 24 | [community_votes](#community_votes) | Community Votes | 5 | Enabled |
| 25 | [community_announcements](#community_announcements) | CVO Official Community Announcements | 6 | Enabled |
| 26 | [pet_match_preferences](#pet_match_preferences) | Private Adoption Matching Preferences | 9 | Enabled |
| 27 | [pet_match_notifications](#pet_match_notifications) | Private Adoption Match Notifications | 7 | Enabled |

---

## <a id="pet_requests"></a>1. Pet Registration Requests (`pet_requests`)

- **Collection ID:** `pet_requests`
- **Display Name:** Pet Registration Requests
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 64 | **Yes** | *null* | - |
| `ownerName` | `string` | size: 128 | **Yes** | *null* | - |
| `petName` | `string` | size: 100 | **Yes** | *null* | - |
| `species` | `string` | size: 10 | **Yes** | *null* | - |
| `breed` | `string` | size: 100 | **Yes** | *null* | - |
| `sex` | `string` | size: 10 | **Yes** | *null* | - |
| `ageYears` | `integer` | min: 0, max: 40 | **Yes** | *null* | - |
| `barangay` | `string` | size: 100 | **Yes** | *null* | - |
| `reviewStatus` | `string` | size: 16 | **Yes** | *null* | - |
| `petProfileId` | `string` | size: 36 | No | *null* | - |

---

## <a id="pets"></a>2. Verified Pets (`pets`)

- **Collection ID:** `pets`
- **Display Name:** Verified Pets
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 64 | **Yes** | *null* | - |
| `ownerName` | `string` | size: 128 | **Yes** | *null* | - |
| `petName` | `string` | size: 100 | **Yes** | *null* | - |
| `species` | `string` | size: 10 | **Yes** | *null* | - |
| `breed` | `string` | size: 100 | **Yes** | *null* | - |
| `sex` | `string` | size: 10 | **Yes** | *null* | - |
| `ageYears` | `integer` | min: 0, max: 40 | **Yes** | *null* | - |
| `barangay` | `string` | size: 100 | **Yes** | *null* | - |
| `requestId` | `string` | size: 36 | **Yes** | *null* | - |
| `petProfileId` | `string` | size: 36 | No | *null* | - |
| `homeAddress` | `string` | size: 200 | No | *null* | - |
| `photoFileId` | `string` | size: 36 | No | *null* | - |
| `lostFoundMessage` | `string` | size: 500 | No | *null* | - |
| `emergencyContact` | `string` | size: 60 | No | *null* | - |
| `sharePublicAddress` | `boolean` | - | No | *null* | - |
| `shareContact` | `boolean` | - | No | *null* | - |
| `vaccinationStatus` | `string` | size: 100 | No | *null* | - |
| `officialRegistryId` | `string` | size: 30 | No | *null* | - |

---

## <a id="medical_records"></a>3. Medical & Vaccination Records (`medical_records`)

- **Collection ID:** `medical_records`
- **Display Name:** Medical & Vaccination Records
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `petId` | `string` | size: 36 | **Yes** | *null* | - |
| `veterinarianId` | `string` | size: 36 | **Yes** | *null* | - |
| `recordType` | `string` | size: 20 | **Yes** | *null* | - |
| `medicineType` | `string` | size: 100 | **Yes** | *null* | - |
| `description` | `string` | size: 1000 | No | *null* | - |
| `dateAdministered` | `datetime` | - | **Yes** | *null* | - |
| `recorderNameSnapshot` | `string` | size: 128 | No | *null* | - |
| `expiryDate` | `text` | - | No | *null* | - |

---

## <a id="disease_reports"></a>4. Unverified Disease Reports (`disease_reports`)

- **Collection ID:** `disease_reports`
- **Display Name:** Unverified Disease Reports
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `reportedById` | `string` | size: 36 | **Yes** | *null* | - |
| `diseaseType` | `string` | size: 60 | **Yes** | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `latitude` | `double` | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | **Yes** | *null* | - |
| `longitude` | `double` | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | **Yes** | *null* | - |
| `description` | `string` | size: 1000 | No | *null* | - |
| `status` | `string` | size: 16 | **Yes** | *null* | - |
| `reportedAt` | `datetime` | - | **Yes** | *null* | - |
| `reporterRole` | `string` | size: 20 | No | *null* | - |
| `photoFileId` | `string` | size: 36 | No | *null* | - |

---

## <a id="disease_incidents"></a>5. Confirmed Disease Incidents (`disease_incidents`)

- **Collection ID:** `disease_incidents`
- **Display Name:** Confirmed Disease Incidents
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `reportId` | `string` | size: 36 | **Yes** | *null* | - |
| `diseaseType` | `string` | size: 60 | **Yes** | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `latitude` | `double` | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | **Yes** | *null* | - |
| `longitude` | `double` | min: -1.7976931348623157e+308, max: 1.7976931348623157e+308 | **Yes** | *null* | - |
| `confirmedById` | `string` | size: 36 | **Yes** | *null* | - |
| `confirmedAt` | `datetime` | - | **Yes** | *null* | - |

---

## <a id="disease_alerts"></a>6. Official Outbreak Alerts (`disease_alerts`)

- **Collection ID:** `disease_alerts`
- **Display Name:** Official Outbreak Alerts
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `title` | `string` | size: 120 | **Yes** | *null* | - |
| `message` | `string` | size: 1500 | **Yes** | *null* | - |
| `diseaseType` | `string` | size: 60 | **Yes** | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `severity` | `string` | size: 10 | **Yes** | *null* | - |
| `issuedById` | `string` | size: 36 | **Yes** | *null* | - |
| `issuedAt` | `datetime` | - | **Yes** | *null* | - |
| `isActive` | `boolean` | - | **Yes** | *null* | - |
| `isOutbreak` | `boolean` | - | No | *null* | - |
| `notifyOwners` | `boolean` | - | No | *null* | - |

---

## <a id="adoption_listings"></a>7. Adoption Listings (`adoption_listings`)

- **Collection ID:** `adoption_listings`
- **Display Name:** Adoption Listings
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("users")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `petId` | `string` | size: 36 | **Yes** | *null* | - |
| `title` | `string` | size: 150 | **Yes** | *null* | - |
| `description` | `string` | size: 1500 | No | *null* | - |
| `requirements` | `string` | size: 1000 | No | *null* | - |
| `species` | `string` | size: 10 | No | *null* | - |
| `breed` | `string` | size: 100 | No | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `activityLevel` | `string` | size: 12 | No | *null* | - |
| `housingRequirement` | `string` | size: 16 | No | *null* | - |
| `status` | `string` | size: 20 | **Yes** | *null* | - |
| `postedById` | `string` | size: 36 | **Yes** | *null* | - |
| `isActive` | `boolean` | - | **Yes** | *null* | - |
| `petProfileId` | `string` | size: 36 | No | *null* | - |
| `verificationStatus` | `string` | size: 20 | No | *null* | - |
| `photoFileId` | `string` | size: 36 | No | *null* | - |
| `ownerAvatarFileId` | `string` | size: 36 | No | *null* | - |
| `ownerDisplayName` | `string` | size: 128 | No | *null* | - |
| `color` | `string` | size: 50 | No | *null* | - |
| `sex` | `string` | size: 20 | No | *null* | - |
| `ageYears` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |

---

## <a id="adoption_applications"></a>8. Adoption Applications (`adoption_applications`)

- **Collection ID:** `adoption_applications`
- **Display Name:** Adoption Applications
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `listingId` | `string` | size: 36 | **Yes** | *null* | - |
| `petId` | `string` | size: 36 | **Yes** | *null* | - |
| `applicantId` | `string` | size: 36 | **Yes** | *null* | - |
| `applicantName` | `string` | size: 128 | **Yes** | *null* | - |
| `message` | `string` | size: 1000 | **Yes** | *null* | - |
| `status` | `string` | size: 20 | **Yes** | *null* | - |
| `submittedAt` | `datetime` | - | **Yes** | *null* | - |
| `contactNumber` | `string` | size: 40 | No | *null* | - |
| `petProfileIdSnapshot` | `string` | size: 36 | No | *null* | - |
| `petNameSnapshot` | `string` | size: 100 | No | *null* | - |
| `listingTitleSnapshot` | `string` | size: 150 | No | *null* | - |

---

## <a id="ownership_history"></a>9. Ownership History (`ownership_history`)

- **Collection ID:** `ownership_history`
- **Display Name:** Ownership History
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `petId` | `string` | size: 36 | **Yes** | *null* | - |
| `previousOwnerId` | `string` | size: 36 | **Yes** | *null* | - |
| `newOwnerId` | `string` | size: 36 | **Yes** | *null* | - |
| `transferType` | `string` | size: 40 | **Yes** | *null* | - |
| `transferDate` | `datetime` | - | **Yes** | *null* | - |
| `previousOwnerName` | `string` | size: 128 | No | *null* | - |
| `newOwnerName` | `string` | size: 128 | No | *null* | - |
| `petName` | `text` | - | No | *null* | - |

---

## <a id="user_profiles"></a>10. Private User Profiles (`user_profiles`)

- **Collection ID:** `user_profiles`
- **Display Name:** Private User Profiles
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("any")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `userId` | `string` | size: 36 | No | *null* | - |
| `fullName` | `string` | size: 128 | No | *null* | - |
| `phone` | `string` | size: 40 | No | *null* | - |
| `address` | `string` | size: 200 | No | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `profileImageId` | `string` | size: 36 | No | *null* | - |
| `position` | `string` | size: 100 | No | *null* | - |
| `employeeId` | `string` | size: 60 | No | *null* | - |
| `assignedArea` | `string` | size: 100 | No | *null* | - |
| `shareAvatarOnListings` | `boolean` | - | No | *null* | - |
| `accountVerificationStatus` | `string` | size: 20 | No | *null* | - |

---

## <a id="pet_profiles"></a>11. Personal Pet Inventory (`pet_profiles`)

- **Collection ID:** `pet_profiles`
- **Display Name:** Personal Pet Inventory
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 36 | No | *null* | - |
| `petName` | `string` | size: 100 | No | *null* | - |
| `species` | `string` | size: 10 | No | *null* | - |
| `breed` | `string` | size: 100 | No | *null* | - |
| `sex` | `string` | size: 10 | No | *null* | - |
| `ageYears` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `homeAddress` | `string` | size: 200 | No | *null* | - |
| `photoFileId` | `string` | size: 36 | No | *null* | - |
| `lostFoundMessage` | `string` | size: 500 | No | *null* | - |
| `emergencyContact` | `string` | size: 60 | No | *null* | - |
| `sharePublicAddress` | `boolean` | - | No | *null* | - |
| `shareContact` | `boolean` | - | No | *null* | - |
| `verificationStatus` | `string` | size: 20 | No | *null* | - |
| `latestRequestId` | `string` | size: 36 | No | *null* | - |
| `profileTitle` | `string` | size: 100 | No | *null* | - |
| `profileDescription` | `string` | size: 1500 | No | *null* | - |
| `shareOwnerName` | `boolean` | - | No | *null* | - |
| `sharePublicPhoto` | `boolean` | - | No | *null* | - |
| `vaccinationStatus` | `string` | size: 100 | No | *null* | - |
| `officialRegistryId` | `string` | size: 30 | No | *null* | - |
| `ancestry` | `text` | - | No | *null* | - |
| `vitalStatus` | `enum (Alive, Deceased, Missing)` | - | No | *null* | - |
| `ancestryParentId` | `string` | size: 36 | No | *null* | - |
| `ancestryParentName` | `string` | size: 100 | No | *null* | - |
| `color` | `string` | size: 50 | No | *null* | - |
| `ancestryParent2Id` | `text` | - | No | *null* | - |
| `ancestryParent2Name` | `text` | - | No | *null* | - |

---

## <a id="pet_passports"></a>12. Public Verified Pet Passports (`pet_passports`)

- **Collection ID:** `pet_passports`
- **Display Name:** Public Verified Pet Passports
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("any")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `petId` | `string` | size: 36 | No | *null* | - |
| `petName` | `string` | size: 100 | No | *null* | - |
| `species` | `string` | size: 10 | No | *null* | - |
| `breed` | `string` | size: 100 | No | *null* | - |
| `sex` | `string` | size: 10 | No | *null* | - |
| `ageYears` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `ownerName` | `string` | size: 128 | No | *null* | - |
| `displayAddress` | `string` | size: 200 | No | *null* | - |
| `contact` | `string` | size: 60 | No | *null* | - |
| `lostFoundMessage` | `string` | size: 500 | No | *null* | - |
| `photoFileId` | `string` | size: 36 | No | *null* | - |
| `vaccinationStatus` | `string` | size: 100 | No | *null* | - |
| `profileTitle` | `string` | size: 100 | No | *null* | - |
| `profileDescription` | `string` | size: 1500 | No | *null* | - |
| `verificationStatus` | `string` | size: 20 | No | *null* | - |
| `officialRegistryId` | `string` | size: 30 | No | *null* | - |

---

## <a id="incident_categories"></a>13. Incident Categories (`incident_categories`)

- **Collection ID:** `incident_categories`
- **Display Name:** Incident Categories
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("users")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `name` | `string` | size: 60 | No | *null* | - |
| `description` | `string` | size: 240 | No | *null* | - |
| `isActive` | `boolean` | - | No | *null* | - |
| `createdById` | `string` | size: 36 | No | *null* | - |

---

## <a id="pet_health_uploads"></a>14. Private Owner Health Uploads (`pet_health_uploads`)

- **Collection ID:** `pet_health_uploads`
- **Display Name:** Private Owner Health Uploads
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 36 | No | *null* | - |
| `petProfileId` | `string` | size: 36 | No | *null* | - |
| `title` | `string` | size: 120 | No | *null* | - |
| `recordDate` | `datetime` | - | No | *null* | - |
| `fileId` | `string` | size: 36 | No | *null* | - |
| `sharePublic` | `boolean` | - | No | *null* | - |
| `expiryDate` | `text` | - | No | *null* | - |

---

## <a id="pet_passport_medical"></a>15. Owner-Shared Public Pet Documents (`pet_passport_medical`)

- **Collection ID:** `pet_passport_medical`
- **Display Name:** Owner-Shared Public Pet Documents
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("any")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `petProfileId` | `string` | size: 36 | No | *null* | - |
| `title` | `string` | size: 120 | No | *null* | - |
| `recordDate` | `datetime` | - | No | *null* | - |
| `fileId` | `string` | size: 36 | No | *null* | - |
| `sourceLabel` | `string` | size: 100 | No | *null* | - |
| `expiryDate` | `text` | - | No | *null* | - |

---

## <a id="pet_registry_ids"></a>16. Reserved Unique CVO Pet IDs (`pet_registry_ids`)

- **Collection ID:** `pet_registry_ids`
- **Display Name:** Reserved Unique CVO Pet IDs
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `requestId` | `string` | size: 36 | No | *null* | - |
| `assignedById` | `string` | size: 36 | No | *null* | - |

---

## <a id="outbreak_owner_notifications"></a>17. Owner-visible CVO outbreak and health notifications (`outbreak_owner_notifications`)

- **Collection ID:** `outbreak_owner_notifications`
- **Display Name:** Owner-visible CVO outbreak and health notifications
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("users")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `sourceAlertId` | `string` | size: 36 | No | *null* | - |
| `title` | `string` | size: 120 | No | *null* | - |
| `message` | `string` | size: 1500 | No | *null* | - |
| `diseaseType` | `string` | size: 60 | No | *null* | - |
| `barangay` | `string` | size: 100 | No | *null* | - |
| `severity` | `string` | size: 10 | No | *null* | - |
| `issuedById` | `string` | size: 36 | No | *null* | - |
| `issuedAt` | `datetime` | - | No | *null* | - |
| `isActive` | `boolean` | - | No | *null* | - |
| `isOutbreak` | `boolean` | - | No | *null* | - |

---

## <a id="id_categories"></a>18. Government ID Categories (`id_categories`)

- **Collection ID:** `id_categories`
- **Display Name:** Government ID Categories
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("users")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `name` | `string` | size: 90 | No | *null* | - |
| `description` | `string` | size: 240 | No | *null* | - |
| `isActive` | `boolean` | - | No | *null* | - |
| `createdById` | `string` | size: 36 | No | *null* | - |
| `categoryCode` | `string` | size: 40 | No | *null* | - |
| `categoryType` | `string` | size: 20 | No | *null* | - |

---

## <a id="owner_verification_requests"></a>19. Private Pet Owner Account Verification Requests (`owner_verification_requests`)

- **Collection ID:** `owner_verification_requests`
- **Display Name:** Private Pet Owner Account Verification Requests
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 36 | No | *null* | - |
| `petProfileId` | `string` | size: 36 | No | *null* | - |
| `idCategoryId` | `string` | size: 36 | No | *null* | - |
| `idCategoryName` | `string` | size: 90 | No | *null* | - |
| `documentFileId` | `string` | size: 36 | No | *null* | - |
| `status` | `string` | size: 20 | No | *null* | - |
| `reviewNote` | `string` | size: 500 | No | *null* | - |
| `submittedAt` | `datetime` | - | No | *null* | - |
| `reviewedById` | `string` | size: 36 | No | *null* | - |

---

## <a id="community_channels"></a>20. Community Channels (`community_channels`)

- **Collection ID:** `community_channels`
- **Display Name:** Community Channels
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `name` | `string` | size: 80 | No | *null* | - |
| `description` | `string` | size: 300 | No | *null* | - |
| `privacy` | `string` | size: 12 | No | *null* | - |
| `createdById` | `string` | size: 36 | No | *null* | - |
| `createdByName` | `string` | size: 128 | No | *null* | - |
| `isArchived` | `boolean` | - | No | *null* | - |

---

## <a id="community_memberships"></a>21. Community Channel Memberships (`community_memberships`)

- **Collection ID:** `community_memberships`
- **Display Name:** Community Channel Memberships
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `channelId` | `string` | size: 36 | No | *null* | - |
| `userId` | `string` | size: 36 | No | *null* | - |
| `userName` | `string` | size: 128 | No | *null* | - |
| `status` | `string` | size: 12 | No | *null* | - |
| `requestedAt` | `datetime` | - | No | *null* | - |
| `reviewedAt` | `datetime` | - | No | *null* | - |

---

## <a id="community_posts"></a>22. Community Discussions (`community_posts`)

- **Collection ID:** `community_posts`
- **Display Name:** Community Discussions
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("any")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `channelId` | `string` | size: 36 | No | *null* | - |
| `authorId` | `string` | size: 36 | No | *null* | - |
| `authorName` | `string` | size: 128 | No | *null* | - |
| `title` | `string` | size: 140 | No | *null* | - |
| `body` | `string` | size: 5000 | No | *null* | - |
| `imageFileIds` | `string` | size: 800 | No | *null* | - |
| `isDeleted` | `boolean` | - | No | *null* | - |
| `authorRole` | `text` | - | No | *null* | - |

---

## <a id="community_comments"></a>23. Community Comments (`community_comments`)

- **Collection ID:** `community_comments`
- **Display Name:** Community Comments
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `channelId` | `string` | size: 36 | No | *null* | - |
| `postId` | `string` | size: 36 | No | *null* | - |
| `parentCommentId` | `string` | size: 36 | No | *null* | - |
| `authorId` | `string` | size: 36 | No | *null* | - |
| `authorName` | `string` | size: 128 | No | *null* | - |
| `body` | `string` | size: 2000 | No | *null* | - |
| `isDeleted` | `boolean` | - | No | *null* | - |
| `authorRole` | `text` | - | No | *null* | - |

---

## <a id="community_votes"></a>24. Community Votes (`community_votes`)

- **Collection ID:** `community_votes`
- **Display Name:** Community Votes
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `channelId` | `string` | size: 36 | No | *null* | - |
| `targetType` | `string` | size: 10 | No | *null* | - |
| `targetId` | `string` | size: 36 | No | *null* | - |
| `userId` | `string` | size: 36 | No | *null* | - |
| `value` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |

---

## <a id="community_announcements"></a>25. CVO Official Community Announcements (`community_announcements`)

- **Collection ID:** `community_announcements`
- **Display Name:** CVO Official Community Announcements
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`, `read("any")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `title` | `string` | size: 140 | No | *null* | - |
| `body` | `string` | size: 2000 | No | *null* | - |
| `audience` | `string` | size: 12 | No | *null* | - |
| `isActive` | `boolean` | - | No | *null* | - |
| `issuedById` | `string` | size: 36 | No | *null* | - |
| `publishedAt` | `datetime` | - | No | *null* | - |

---

## <a id="pet_match_preferences"></a>26. Private Adoption Matching Preferences (`pet_match_preferences`)

- **Collection ID:** `pet_match_preferences`
- **Display Name:** Private Adoption Matching Preferences
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 36 | No | *null* | - |
| `species` | `string` | size: 12 | No | *null* | - |
| `breed` | `string` | size: 100 | No | *null* | - |
| `color` | `string` | size: 50 | No | *null* | - |
| `sex` | `string` | size: 12 | No | *null* | - |
| `minAgeYears` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |
| `maxAgeYears` | `integer` | min: -9223372036854776000, max: 9223372036854776000 | No | *null* | - |
| `isEnabled` | `boolean` | - | No | *null* | - |
| `pushEnabled` | `boolean` | - | No | *null* | - |

---

## <a id="pet_match_notifications"></a>27. Private Adoption Match Notifications (`pet_match_notifications`)

- **Collection ID:** `pet_match_notifications`
- **Display Name:** Private Adoption Match Notifications
- **Database ID:** `cityvethub`
- **Row Security:** Enabled
- **Permissions:** `read("team:cityvethub-admins")`

### Attributes / Columns

| Attribute Name | Type | Constraints / Size | Required | Default | Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ownerId` | `string` | size: 36 | No | *null* | - |
| `listingId` | `string` | size: 36 | No | *null* | - |
| `petName` | `string` | size: 100 | No | *null* | - |
| `title` | `string` | size: 150 | No | *null* | - |
| `createdAt` | `datetime` | - | No | *null* | - |
| `isRead` | `boolean` | - | No | *null* | - |
| `pushStatus` | `string` | size: 20 | No | *null* | - |

---

