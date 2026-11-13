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
  ancestry?: string;
  ancestryParentId?: string;
  ancestryParentName?: string;
  ancestryParent2Id?: string;
  ancestryParent2Name?: string;
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
  expiryDate?: string;
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
  recorderNameSnapshot?: string;
  expiryDate?: string;
}

export interface OwnershipEventRow extends AppwriteMeta {
  petId: string;
  petName?: string;
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