export interface VisitedLocation {
  id: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// GeoJSON types for revealed geometry
export type RevealedGeometry = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;

export interface RevealedAreaStats {
  locationCount: number;
  lastUpdated: number;
}

// Location source - 'self' for personally visited, 'shared' for received from others
export type LocationSource = 'self' | 'shared';

// Location data for export/import via Bluetooth
export interface ExportableLocation {
  lat: number;
  lon: number;
  ts: number;
}

export interface LocationExportData {
  version: number;
  locations: ExportableLocation[];
}

// Bluetooth types
export interface DiscoveredDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export type BluetoothState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'poweredOn';

export type TransferState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'transferring'
  | 'completed'
  | 'error';

export interface TransferProgress {
  state: TransferState;
  currentChunk: number;
  totalChunks: number;
  errorMessage?: string;
}
