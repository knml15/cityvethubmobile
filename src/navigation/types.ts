import { NavigatorScreenParams } from '@react-navigation/native';
import { PetPassport } from '../store/types/pets';

// Pet Owner Main Tab Routes (Phase 4.16 includes Community)
export type MainTabParamList = {
  AdoptionFeed: undefined;
  SurveillanceMap: undefined;
  Community: undefined;
  UserProfile: undefined;
  Settings: undefined;
};

// Root Stack Routes
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainApp: NavigatorScreenParams<MainTabParamList> | undefined;
  OfficerApp: undefined;
  PetDetail: { pet: PetPassport | any; isOwned?: boolean };
  ApplyAdoption: { petId: string | number };
  ReportIncident: undefined;
  OwnedPetPassport: { pet: any };
};