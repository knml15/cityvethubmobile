import { IliganBarangay } from './constants';
import { AppwriteMeta } from './auth';

export type DiseaseType =
  | 'RABIES'
  | 'PARVO'
  | 'DISTEMPER'
  | 'PANLEUK'
  | 'LEPTO'
  | 'OTHER'
  | string;
export type SeverityLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL'
  | 'low'
  | 'medium'
  | 'high'
  | 'Moderate'
  | 'Critical'
  | string;
export type AlertStatus = 'UNVERIFIED' | 'VERIFIED' | 'RESOLVED';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface IncidentCategoryRow extends AppwriteMeta {
  name: string;
  description?: string;
  isActive: boolean;
  createdById?: string;
}

export interface IncidentReportRow extends AppwriteMeta {
  reportedById: string;
  reporterRole?: 'owner' | 'officer' | 'admin';
  diseaseType: string;
  barangay: string;
  latitude: number;
  longitude: number;
  description?: string;
  status?: string;
  reportedAt: string;
  photoFileId?: string;
}

export interface OutbreakAlertRow extends AppwriteMeta {
  sourceAlertId?: string;
  title: string;
  message: string;
  diseaseType: string;
  barangay: string;
  severity: 'low' | 'medium' | 'high';
  issuedById: string;
  issuedAt: string;
  isActive: boolean;
  isOutbreak?: boolean;
  notifyOwners?: boolean;
}

export interface DiseaseAlert {
  id?: string | number;
  title: string;
  disease: DiseaseType;
  species?: 'Dog' | 'Cat';
  barangay: IliganBarangay | string;
  severity: SeverityLevel;
  status: AlertStatus;
  description: string;
  precautionary_measures?: string;
  created_at?: string;
  lat: number;
  lng: number;
  isOutbreak?: boolean;
  reporterRole?: 'owner' | 'officer' | 'admin';
  photoFileId?: string;
  sourceType?: 'ALERT' | 'INCIDENT' | 'REPORT' | 'OWNER_NOTICE';
}

export interface SurveillanceState {
  activeAlerts: DiseaseAlert[];
  staffReports: IncidentReportRow[];
  incidentCategories: IncidentCategoryRow[];
  heatMapData: Coordinates[];
  isLoading: boolean;
  fetchDiseaseAlerts: () => Promise<void>;
  fetchIncidentCategories: () => Promise<void>;
  fetchStaffReports: () => Promise<void>;
  reportIncident: (reportData: Partial<DiseaseAlert>) => Promise<void>;
}