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
  pushNotificationsEnabled: boolean;
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