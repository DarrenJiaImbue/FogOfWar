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
