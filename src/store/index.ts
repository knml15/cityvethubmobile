import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Query } from 'react-native-appwrite';
import {
  account,
  databases,
  operate,
  APPWRITE_DATABASE_ID,
  TABLES,
  clearPrivateImageCache,
} from '../api/client';
import { authApi } from '../api/auth';
import { adoptionApi } from '../api/adoption';
import { diseaseApi } from '../api/disease';
import { CitizenProfile } from './types/auth';
import { AdoptionState, AdoptionApplication } from './types/adoption';
import {
  SurveillanceState,
  DiseaseAlert,
  IncidentCategoryRow,
  IncidentReportRow,
} from './types/surveillance';

interface AuthStoreState {
  user: CitizenProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  login: (credentials: {
    email?: string;
    username?: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isRestoring: true,

  login: async (credentials) => {
    set({ isLoading: true });
    const emailInput = (
      credentials.email ||
      credentials.username ||
      ''
    )
      .trim()
      .toLowerCase();

    try {
      try {
        await account.deleteSession('current');
      } catch {
        // Ignore if no active session exists
      }

      const session = await account.createEmailPasswordSession(
        emailInput,
        credentials.password
      );

      const profile = await authApi.resolveCurrentUser();

      // Contract Section 09.A: Block unapproved pending officers from entering protected screens
      if (profile.contractRole === 'pending_officer') {
        try {
          await operate('blockPendingOfficer', {});
        } catch {
          // Ignore if already blocked
        }
        await account.deleteSession('current').catch(() => {});
        await SecureStore.deleteItemAsync('auth_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        throw new Error(
          'Awaiting CVO Approval: Your Field Officer account is pending verification by a CVO Administrator.'
        );
      }

      await SecureStore.setItemAsync('auth_token', session.$id);

      set({
        token: session.$id,
        isAuthenticated: true,
        user: profile,
        isLoading: false,
      });
    } catch (error: any) {
      set({ isLoading: false });
      const rawMsg = String(error?.message || '');
      if (
        rawMsg.toLowerCase().includes('blocked') ||
        rawMsg.toLowerCase().includes('user_blocked') ||
        rawMsg.toLowerCase().includes('awaiting cvo approval')
      ) {
        alert(
          'Awaiting CVO Approval: Your Field Officer account is currently disabled until a CVO Administrator approves your membership in cityvethub-field-officers.'
        );
      } else {
        alert(
          rawMsg || 'Login failed. Please check your email and password.'
        );
      }
    }
  },

  setTheme: async (theme) => {
    const previous = useAuthStore.getState().user;
    if (!previous) return;
    set({ user: { ...previous, theme } }); // immediate appearance, before network request
    try {
      await authApi.saveThemePreference(theme);
    } catch (error) {
      set({ user: previous });
      throw error;
    }
  },

  refreshSession: async () => {
    set({ isRestoring: true });
    try {
      const profile = await authApi.resolveCurrentUser();
      if (profile.contractRole === 'pending_officer') {
        await account.deleteSession('current').catch(() => {});
        await SecureStore.deleteItemAsync('auth_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isRestoring: false,
        });
        return;
      }

      const savedToken = await SecureStore.getItemAsync('auth_token');
      set({
        user: profile,
        token: savedToken || 'active-session',
        isAuthenticated: true,
        isRestoring: false,
      });
    } catch {
      await SecureStore.deleteItemAsync('auth_token').catch(() => {});
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isRestoring: false,
      });
    }
  },

  logout: async () => {
    try {
      await account.deleteSession('current');
    } catch (e) {
      console.warn('Session already cleared:', e);
    }
    await SecureStore.deleteItemAsync('auth_token').catch(() => {});
    clearPrivateImageCache();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export const useAdoptionStore = create<AdoptionState>((set, get) => ({
  availablePets: [],
  myApplications: [],
  incomingApplications: [],
  isLoading: false,

  fetchAvailablePets: async () => {
    set({ isLoading: true });
    try {
      const listings = await adoptionApi.getAvailablePets();
      set({ availablePets: listings, isLoading: false });
    } catch (error) {
      console.error('Appwrite fetchAvailablePets error:', error);
      set({ isLoading: false });
    }
  },

  fetchMyApplications: async () => {
    set({ isLoading: true });
    try {
      const apps = await adoptionApi.getMyApplications();
      set({ myApplications: apps, isLoading: false });
    } catch (error) {
      console.error('Appwrite fetchMyApplications error:', error);
      set({ isLoading: false });
    }
  },

  fetchIncomingApplications: async () => {
    set({ isLoading: true });
    try {
      const res = await operate<any>('listOwnListingApplications', {});
      const rawList: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.applications)
        ? res.applications
        : Array.isArray(res?.documents)
        ? res.documents
        : [];

      const mapped: AdoptionApplication[] = rawList.map((doc: any) => ({
        id: doc.$id || doc.id,
        listingId: doc.listingId,
        pet: doc.petId || doc.listingId,
        petName: doc.petNameSnapshot || doc.petName || doc.listingTitleSnapshot || doc.listingTitle || 'Listed Companion',
        listingTitle: doc.listingTitleSnapshot || doc.listingTitle || doc.title,
        applicant: doc.applicantId,
        applicantId: doc.applicantId,
        applicantName: doc.applicantName || 'Pet Owner Applicant',
        message: doc.message || '',
        contact_number: doc.contactNumber || '',
        contactNumber: doc.contactNumber || '',
        address: 'Iligan City',
        reason_for_adoption: doc.message || '',
        has_other_pets: false,
        status: String(doc.status || 'pending').toUpperCase() as any,
        applied_at: doc.submittedAt || doc.$createdAt,
      }));

      set({ incomingApplications: mapped, isLoading: false });
    } catch (error) {
      console.warn('listOwnListingApplications warning:', error);
      set({ isLoading: false });
    }
  },

  submitApplication: async (data: Partial<AdoptionApplication>) => {
    set({ isLoading: true });
    try {
      const created = await adoptionApi.submitApplication(data);
      set({
        myApplications: [created, ...get().myApplications],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  listOwnPet: async (payload) => {
    set({ isLoading: true });
    try {
      await operate('listOwnPetForAdoption', payload);
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  reviewApplication: async (applicationId, decision) => {
    set({ isLoading: true });
    try {
      await operate('reviewOwnAdoption', { applicationId, decision });
      await get().fetchIncomingApplications();
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  confirmTransfer: async (applicationId) => {
    set({ isLoading: true });
    try {
      await operate('confirmAdoptionTransfer', { applicationId });
      await get().fetchIncomingApplications();
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  toggleListingVisibility: async (listingId) => {
    set({ isLoading: true });
    try {
      await operate('toggleListing', { listingId });
      await get().fetchAvailablePets();
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));

export const useSurveillanceStore = create<SurveillanceState>((set) => ({
  activeAlerts: [],
  staffReports: [],
  incidentCategories: [],
  heatMapData: [],
  isLoading: false,

  fetchDiseaseAlerts: async () => {
    set({ isLoading: true });
    try {
      const alerts = await diseaseApi.getActiveAlerts();
      const coords = alerts.map((a) => ({
        latitude: a.lat,
        longitude: a.lng,
      }));
      set({
        activeAlerts: alerts,
        heatMapData: coords,
        isLoading: false,
      });
    } catch (error) {
      console.error('Appwrite fetchDiseaseAlerts error:', error);
      set({ isLoading: false });
    }
  },

  fetchIncidentCategories: async () => {
    try {
      const res = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.INCIDENT_CATEGORIES,
        [Query.equal('isActive', true), Query.limit(100)]
      );
      set({
        incidentCategories: res.documents as unknown as IncidentCategoryRow[],
      });
    } catch (error) {
      console.warn('Could not fetch incident_categories:', error);
    }
  },

  fetchStaffReports: async () => {
    set({ isLoading: true });
    try {
      // Cursor pagination avoids the old 100-record cutoff on backlogged reports.
      const all: IncidentReportRow[] = [];
      let cursor = '';
      for (let page = 0; page < 20; page++) {
        const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const result = await databases.listDocuments(APPWRITE_DATABASE_ID, TABLES.DISEASE_REPORTS, queries);
        const records = result.documents as unknown as IncidentReportRow[];
        all.push(...records);
        if (records.length < 100) break;
        cursor = records[records.length - 1].$id;
      }
      set({
        staffReports: all.filter(record => String(record.status || '').toLowerCase() !== 'archived'),
        isLoading: false,
      });
    } catch (error) {
      console.warn('Could not fetch staff disease_reports:', error);
      set({ isLoading: false });
    }
  },

  reportIncident: async (reportData: Partial<DiseaseAlert>) => {
    set({ isLoading: true });
    try {
      await diseaseApi.reportIncident(reportData);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));