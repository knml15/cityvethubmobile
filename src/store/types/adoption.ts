import { AdoptionListing } from './pets';
import { AppwriteMeta } from './auth';

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESERVED'
  | 'COMPLETED'
  | 'OWNER_APPROVED';

export type ListingStatus = 'available' | 'reserved' | 'adopted';

export interface AdoptionApplicationRow extends AppwriteMeta {
  listingId: string;
  petId: string;
  applicantId: string;
  applicantName: string;
  message: string;
  contactNumber: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'owner_approved';
  submittedAt: string;
}

export interface AdoptionApplication {
  id?: string | number;
  listingId?: string;
  pet: string | number;
  petName?: string;
  listingTitle?: string;
  applicant?: string | number;
  applicantId?: string;
  applicantName?: string;
  message?: string;
  contact_number: string;
  contactNumber?: string;
  address: string;
  reason_for_adoption: string;
  has_other_pets: boolean;
  status: ApplicationStatus;
  applied_at?: string;
}

export interface AdoptionState {
  availablePets: AdoptionListing[];
  myApplications: AdoptionApplication[];
  incomingApplications: AdoptionApplication[];
  isLoading: boolean;
  fetchAvailablePets: () => Promise<void>;
  fetchMyApplications: () => Promise<void>;
  fetchIncomingApplications: () => Promise<void>;
  submitApplication: (data: Partial<AdoptionApplication>) => Promise<void>;
  listOwnPet: (payload: {
    petProfileId: string;
    title: string;
    description: string;
    requirements?: string;
    housingRequirement: 'any' | 'apartment' | 'house' | 'yard';
    publishPetPhoto: boolean;
    showOwnerName: boolean;
    publishOwnerPhoto: boolean;
  }) => Promise<void>;
  reviewApplication: (
    applicationId: string,
    decision: 'approve' | 'decline'
  ) => Promise<void>;
  confirmTransfer: (applicationId: string) => Promise<void>;
  toggleListingVisibility: (listingId: string) => Promise<void>;
}

// Phase 4.16 Community Social Hub Types
export type CommunityPrivacy = 'public' | 'private';
export type ChannelMemberStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type VoteValue = -1 | 0 | 1;
export type NoticeAudience = 'owners' | 'officers' | 'both';
export type NoticeCategory = 'outbreak' | 'advisory' | 'announcement';

export interface CommunityChannel {
  id: string;
  name: string;
  description: string;
  privacy: CommunityPrivacy;
  createdByName?: string;
  isCreator: boolean;
  membership: ChannelMemberStatus;
  canRead: boolean;
  createdAt?: string;
}

export interface CommunityPost {
  id: string;
  channelId: string;
  channelName?: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  imageFileIds: string[];
  isDeleted: boolean;
  createdAt: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  myVote?: VoteValue;
  commentCount?: number;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentCommentId: string;
  authorId: string;
  authorName: string;
  body: string;
  isDeleted: boolean;
  createdAt: string;
  score?: number;
  upvotes?: number;
  downvotes?: number;
  myVote?: VoteValue;
}

export interface ChannelJoinRequest {
  id: string;
  userId: string;
  userName: string;
  requestedAt: string;
}

export interface CommunityNotice {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  audience: NoticeAudience;
  priority: 'low' | 'medium' | 'high' | 'info';
  date: string;
  barangay: string;
  isActive: boolean;
}

export interface CommunityOverview {
  channels: CommunityChannel[];
  verified: boolean;
  role: 'owner' | 'officer' | 'admin';
  notices: CommunityNotice[];
}