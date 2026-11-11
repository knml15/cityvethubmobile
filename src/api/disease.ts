import { Query } from 'react-native-appwrite';
import {
  databases,
  operate,
  APPWRITE_DATABASE_ID,
  TABLES,
} from './client';
import { DiseaseAlert } from '../store/types/surveillance';
import {
  getBarangayCoords,
  IliganBarangay,
  normalizeBarangay,
} from '../store/types/constants';

export const diseaseApi = {
  /**
   * Fetches active staff alerts from `disease_alerts` (for Field Officers).
   * Note: Pet Owners receive their official notices via `communityOfficialNotices`
   * and `outbreak_owner_notifications` inside the Community tab.
   */
  getActiveAlerts: async (): Promise<DiseaseAlert[]> => {
    const combinedAlerts: DiseaseAlert[] = [];

    try {
      const alertsRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.DISEASE_ALERTS,
        [Query.orderDesc('$createdAt'), Query.limit(100)]
      );

      alertsRes.documents.forEach((doc: any, idx: number) => {
        const canonicalBrgy = normalizeBarangay(doc.barangay);
        const baseCoords = getBarangayCoords(canonicalBrgy);

        if (!doc.isActive) return;
        combinedAlerts.push({
          id: doc.$id,
          title: doc.title || doc.diseaseType || 'CVO Staff Alert',
          disease: doc.diseaseType || 'Advisory',
          barangay: canonicalBrgy as IliganBarangay,
          severity: doc.severity || 'medium',
          status: doc.isActive ? 'VERIFIED' : 'RESOLVED',
          description: doc.message || '',
          created_at: doc.issuedAt || doc.$createdAt,
          lat: baseCoords.latitude + (idx % 3) * 0.0005,
          lng: baseCoords.longitude + (idx % 3) * 0.0005,
          isOutbreak: Boolean(doc.isOutbreak),
          sourceType: 'ALERT',
        });
      });
    } catch {
      // Non-staff users cannot read `disease_alerts` directly
    }

    return combinedAlerts;
  },

  /**
   * Submits an incident report via `cityvethub-operations` (`submitDisease`).
   * Contract Section 07 & 08.F:
   * - Requires `accountVerificationStatus === 'verified'` for Pet Owners, or approved Team membership for Field Officers.
   * - Validates coordinates within Philippine bounds (4 <= lat <= 22, 116 <= lng <= 127).
   */
  reportIncident: async (reportData: Partial<DiseaseAlert>): Promise<void> => {
    const barangay = normalizeBarangay(reportData.barangay);
    const defaultCoords = getBarangayCoords(barangay);

    const latitude =
      typeof reportData.lat === 'number' &&
      Number.isFinite(reportData.lat) &&
      reportData.lat >= 4 &&
      reportData.lat <= 22
        ? reportData.lat
        : defaultCoords.latitude;

    const longitude =
      typeof reportData.lng === 'number' &&
      Number.isFinite(reportData.lng) &&
      reportData.lng >= 116 &&
      reportData.lng <= 127
        ? reportData.lng
        : defaultCoords.longitude;

    const diseaseType = String(
      reportData.disease || reportData.title || ''
    ).trim();
    if (!diseaseType) {
      throw new Error('Please select an active incident category.');
    }

    await operate('submitDisease', {
      diseaseType,
      barangay,
      latitude,
      longitude,
      description: String(reportData.description || '').trim(),
      photoFileId: String(reportData.photoFileId || ''),
    });
  },
};