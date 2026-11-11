/** CityVetHub Phase 4.22: all data is from the EXISTING shared Appwrite backend. */
import { Query } from 'react-native-appwrite';
import { account, databases, APPWRITE_DATABASE_ID, TABLES, operate } from './client';

export type PetSpeciesPreference = 'Any' | 'Dog' | 'Cat';
export type PetSexPreference = 'Any' | 'Male' | 'Female';
export interface PetMatchPreference {
  species: PetSpeciesPreference;
  breed: string;
  color: string;
  sex: PetSexPreference;
  minAgeYears: number;
  maxAgeYears: number;
  isEnabled: boolean;
  pushEnabled: boolean;
}
export interface PetMatchNotification {
  $id: string;
  listingId: string;
  petName: string;
  title: string;
  createdAt: string;
  isRead: boolean;
  pushStatus?: string;
}
export interface StaffIncidentDetails {
  $id: string;
  reporterName: string;
  reporterRole?: string;
  diseaseType: string;
  description?: string;
  barangay: string;
  latitude: number;
  longitude: number;
  reportedAt?: string;
  status?: string;
  photoUrl?: string; // temporary five-minute token URL; never store persistently
}
const required = [4, 22, 0];
export async function requirePhase422Backend() {
  const result = await operate<{build?:string}>('ping');
  const build = String(result?.build || '0.0.0');
  const digits = build.split('.').map(n => Number.parseInt(n, 10) || 0);
  const older = required.some((minimum, i) => {
    const precedingSame = required.slice(0, i).every((part, j) => digits[j] === part);
    return precedingSame && (digits[i] || 0) < minimum;
  });
  if (older) throw new Error('This feature is temporarily unavailable. Please try again shortly.');
  return build;
}
export const defaultMatchPreferences: PetMatchPreference = {
  species:'Any',breed:'',color:'',sex:'Any',minAgeYears:0,maxAgeYears:40,isEnabled:true,pushEnabled:false,
};
export async function getMatchPreferences(): Promise<PetMatchPreference> {
  await requirePhase422Backend();
  const saved = await operate<Partial<PetMatchPreference> | null>('getAdoptionPreferences');
  return {...defaultMatchPreferences,...(saved || {})};
}
export async function saveMatchPreferences(values: PetMatchPreference) {
  await requirePhase422Backend();
  if(!Number.isInteger(values.minAgeYears) || !Number.isInteger(values.maxAgeYears) || values.minAgeYears<0 || values.maxAgeYears>40 || values.minAgeYears>values.maxAgeYears) {
    throw new Error('Choose whole-number age limits between 0 and 40; minimum cannot exceed maximum.');
  }
  return operate('saveAdoptionPreferences', values as unknown as Record<string, unknown>);
}
export async function getMatchNotifications(): Promise<PetMatchNotification[]> {
  await requirePhase422Backend();
  const owner = await account.get();
  const rows: PetMatchNotification[]=[];
  let cursor='';
  for(let page=0;page<10;page++){
    // A private row-security table can be read by the owner without a composite
    // ownerId + createdAt index. Filter by owner again for defense in depth.
    const queries=[Query.limit(100)];
    if(cursor)queries.push(Query.cursorAfter(cursor));
    const res=await databases.listDocuments(APPWRITE_DATABASE_ID,TABLES.PET_MATCH_NOTIFICATIONS,queries);
    const docs=res.documents as unknown as PetMatchNotification[];
    rows.push(...docs.filter(row=>(row as any).ownerId===owner.$id));
    if(docs.length<100)break;
    cursor=docs[docs.length-1].$id;
  }

  // Cross-reference against active adoption listings to prevent ghost alerts for unlisted/deactivated pets
  try {
    const activeRes = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      TABLES.ADOPTION_LISTINGS,
      [Query.equal('isActive', true), Query.limit(100)]
    );
    const activeListingIds = new Set(
      activeRes.documents
        .filter((d: any) => String(d.status || '').toLowerCase() !== 'adopted')
        .map((d: any) => String(d.$id))
    );
    return rows
      .filter((row) => activeListingIds.has(String(row.listingId)))
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  } catch {
    return rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
}
export async function readMatchNotification(notificationId: string) {
  if (!notificationId) throw new Error('Notification ID is required.');
  return operate('markAdoptionMatchRead', {notificationId});
}
export async function fetchBreedCatalog(species:'Dog'|'Cat'): Promise<string[]> {
  await requirePhase422Backend();
  const response = await operate<{breeds?:string[]}>('getBreedCatalog',{species});
  return Array.isArray(response?.breeds) ? response.breeds.filter(b=>typeof b==='string'&&b.length>0) : [];
}
export const fallbackBreedCatalog: Record<'Dog'|'Cat',string[]> = {
  Dog:['Aspin (Philippine native dog)','Beagle','Chihuahua','Dachshund','German Shepherd','Golden Retriever','Labrador Retriever','Mixed Breed','Pomeranian','Poodle','Pug','Shih Tzu','Siberian Husky','Other / Unknown'],
  Cat:['Domestic Shorthair','Domestic Longhair','Puspin','Persian','Siamese','British Shorthair','Bengal','Maine Coon','Ragdoll','Mixed Breed','Other / Unknown'],
};
export async function getStaffIncidentDetails(reportId:string) {
  await requirePhase422Backend();
  return operate<StaffIncidentDetails>('getIncidentReportDetails',{reportId});
}
