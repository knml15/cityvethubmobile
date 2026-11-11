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