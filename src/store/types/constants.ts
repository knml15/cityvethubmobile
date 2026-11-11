// Canonical 44 Iligan City Barangays (PSA PSGC 1030900000) — Validated by cityvethub-operations
export const ILIGAN_BARANGAYS = [
  'Abuno',
  'Acmac-Mariano Badelles Sr.',
  'Bagong Silang',
  'Bonbonon',
  'Bunawan',
  'Buru-un',
  'Dalipuga',
  'Del Carmen',
  'Digkilaan',
  'Ditucalan',
  'Dulag',
  'Hinaplanon',
  'Hindang',
  'Kabacsanan',
  'Kalilangan',
  'Kiwalan',
  'Lanipao',
  'Luinab',
  'Mahayahay',
  'Mainit',
  'Mandulog',
  'Maria Cristina',
  'Palao',
  'Panoroganan',
  'Poblacion',
  'Puga-an',
  'Rogongon',
  'San Miguel',
  'San Roque',
  'Santa Elena',
  'Santa Filomena',
  'Santiago',
  'Santo Rosario',
  'Saray',
  'Suarez',
  'Tambacan',
  'Tibanga',
  'Tipanoy',
  'Tomas L. Cabili',
  'Tubod',
  'Ubaldo Laya',
  'Upper Hinaplanon',
  'Upper Tominobo',
  'Villa Verde',
] as const;

export type IliganBarangay = (typeof ILIGAN_BARANGAYS)[number];

// Legacy alias map for old rows created before canonical enforcement
const LEGACY_BARANGAY_MAP: Record<string, IliganBarangay> = {
  Acmac: 'Acmac-Mariano Badelles Sr.',
  'Pala-o': 'Palao',
  'Tomas Cabili': 'Tomas L. Cabili',
  Sarigao: 'Santiago',
};

export const normalizeBarangay = (value?: string | null): IliganBarangay => {
  if (!value) return 'Poblacion';
  const trimmed = value.trim();
  if ((ILIGAN_BARANGAYS as readonly string[]).includes(trimmed)) {
    return trimmed as IliganBarangay;
  }
  if (trimmed in LEGACY_BARANGAY_MAP) {
    return LEGACY_BARANGAY_MAP[trimmed];
  }
  return 'Poblacion';
};

// Reference GPS coordinates for all 44 Iligan City barangays
export const ILIGAN_BARANGAY_COORDS: Record<
  IliganBarangay,
  { latitude: number; longitude: number }
> = {
  Abuno: { latitude: 8.195, longitude: 124.258 },
  'Acmac-Mariano Badelles Sr.': { latitude: 8.261, longitude: 124.256 },
  'Bagong Silang': { latitude: 8.2345, longitude: 124.2485 },
  Bonbonon: { latitude: 8.221, longitude: 124.289 },
  Bunawan: { latitude: 8.301, longitude: 124.285 },
  'Buru-un': { latitude: 8.1885, longitude: 124.1695 },
  Dalipuga: { latitude: 8.312, longitude: 124.259 },
  'Del Carmen': { latitude: 8.2255, longitude: 124.2565 },
  Digkilaan: { latitude: 8.251, longitude: 124.331 },
  Ditucalan: { latitude: 8.176, longitude: 124.205 },
  Dulag: { latitude: 8.208, longitude: 124.312 },
  Hinaplanon: { latitude: 8.2485, longitude: 124.2555 },
  Hindang: { latitude: 8.288, longitude: 124.338 },
  Kabacsanan: { latitude: 8.291, longitude: 124.302 },
  Kalilangan: { latitude: 8.195, longitude: 124.342 },
  Kiwalan: { latitude: 8.275, longitude: 124.2595 },
  Lanipao: { latitude: 8.215, longitude: 124.325 },
  Luinab: { latitude: 8.233, longitude: 124.263 },
  Mahayahay: { latitude: 8.2235, longitude: 124.2445 },
  Mainit: { latitude: 8.278, longitude: 124.351 },
  Mandulog: { latitude: 8.246, longitude: 124.281 },
  'Maria Cristina': { latitude: 8.1795, longitude: 124.1915 },
  Palao: { latitude: 8.228, longitude: 124.248 },
  Panoroganan: { latitude: 8.219, longitude: 124.365 },
  Poblacion: { latitude: 8.2285, longitude: 124.2375 },
  'Puga-an': { latitude: 8.2225, longitude: 124.2695 },
  Rogongon: { latitude: 8.235, longitude: 124.415 },
  'San Miguel': { latitude: 8.2355, longitude: 124.244 },
  'San Roque': { latitude: 8.242, longitude: 124.252 },
  'Santa Elena': { latitude: 8.239, longitude: 124.259 },
  'Santa Filomena': { latitude: 8.268, longitude: 124.2575 },
  Santiago: { latitude: 8.245, longitude: 124.242 },
  'Santo Rosario': { latitude: 8.2325, longitude: 124.2435 },
  Saray: { latitude: 8.236, longitude: 124.236 },
  Suarez: { latitude: 8.202, longitude: 124.219 },
  Tambacan: { latitude: 8.2205, longitude: 124.2335 },
  Tibanga: { latitude: 8.2415, longitude: 124.244 },
  Tipanoy: { latitude: 8.2035, longitude: 124.261 },
  'Tomas L. Cabili': { latitude: 8.2175, longitude: 124.238 },
  Tubod: { latitude: 8.2165, longitude: 124.2415 },
  'Ubaldo Laya': { latitude: 8.2245, longitude: 124.2515 },
  'Upper Hinaplanon': { latitude: 8.2535, longitude: 124.2665 },
  'Upper Tominobo': { latitude: 8.209, longitude: 124.231 },
  'Villa Verde': { latitude: 8.227, longitude: 124.244 },
};

export const getBarangayCoords = (
  barangay?: string
): { latitude: number; longitude: number } => {
  const canonical = normalizeBarangay(barangay);
  return (
    ILIGAN_BARANGAY_COORDS[canonical] || {
      latitude: 8.228,
      longitude: 124.2452,
    }
  );
};

// Finds the closest canonical Iligan barangay when user taps on the Leaflet map
export const findNearestBarangay = (
  lat: number,
  lng: number
): IliganBarangay => {
  let closest: IliganBarangay = 'Poblacion';
  let minDistance = Number.MAX_VALUE;

  for (const brgy of ILIGAN_BARANGAYS) {
    const coords = ILIGAN_BARANGAY_COORDS[brgy];
    const dist =
      Math.pow(coords.latitude - lat, 2) + Math.pow(coords.longitude - lng, 2);
    if (dist < minDistance) {
      minDistance = dist;
      closest = brgy;
    }
  }
  return closest;
};