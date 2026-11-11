import { NavigatorScreenParams } from '@react-navigation/native';
import { PetPassport } from '../store/types/pets';

// Pet Owner Main Tab Routes (Phase 4.16 includes Community)
export type MainTabParamList = {
  AdoptionFeed: undefined;
  SurveillanceMap: undefined;
  Community: { channelId?: string; postId?: string; tab?: 'feed' | 'channels' | 'notices' } | undefined;
  UserProfile: undefined;
  Settings: undefined;
};

// Field Officer Tab Routes (Community replaces AdoptionFeed)
export type OfficerTabParamList = {
  FieldLookup: undefined;
  FieldIncidents: undefined;
  OcularQueue: undefined;
  Community: { channelId?: string; postId?: string; tab?: 'feed' | 'channels' | 'notices' } | undefined;
  Settings: undefined;
};

// Root Stack Routes
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainApp: NavigatorScreenParams<MainTabParamList> | undefined;
  OfficerApp: NavigatorScreenParams<OfficerTabParamList> | undefined;
  PetDetail: { pet: PetPassport | any; isOwned?: boolean };
  ApplyAdoption: { petId: string | number };
  ReportIncident: undefined;
  OwnedPetPassport: { pet: any };
};