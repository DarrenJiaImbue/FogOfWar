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
