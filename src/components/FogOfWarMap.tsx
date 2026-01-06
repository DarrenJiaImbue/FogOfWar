import React, { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import MapLibreGL, { type MapViewRef, type CameraRef } from '@maplibre/maplibre-react-native';
import { VisitedLocation, LocationPoint } from '../types';

// Initialize MapLibre
MapLibreGL.setAccessToken(null);

interface FogOfWarMapProps {
  visitedLocations: VisitedLocation[];
  currentLocation: LocationPoint | null;
  revealRadiusMiles?: number;
}

// Convert miles to degrees (approximate)
const milesToDegrees = (miles: number): number => miles / 69;

// Default location (San Francisco) if no location available
const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749]; // [lng, lat]
const DEFAULT_ZOOM = 14;

// Custom style with OpenStreetMap tiles
const MAP_STYLE = {
  version: 8 as const,
  name: 'OSM Style',
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster' as const,
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export function FogOfWarMap({
  visitedLocations,
  currentLocation,
  revealRadiusMiles = 0.1,
}: FogOfWarMapProps) {
  const mapRef = useRef<MapViewRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  // Center map on current location when it changes
  useEffect(() => {
    if (currentLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [currentLocation.longitude, currentLocation.latitude],
        zoomLevel: 15,
        animationDuration: 500,
      });
    }
  }, [currentLocation]);

  // Initial center based on current location or visited locations
  const initialCenter = useMemo((): [number, number] => {
    if (currentLocation) {
      return [currentLocation.longitude, currentLocation.latitude];
    }

    if (visitedLocations.length > 0) {
      const latestLocation = visitedLocations[0];
      return [latestLocation.longitude, latestLocation.latitude];
    }

    return DEFAULT_CENTER;
  }, [currentLocation, visitedLocations]);

  // Generate GeoJSON for revealed areas (circles around visited locations)
  const revealedAreasGeoJSON = useMemo(() => {
    const features = visitedLocations.map((location) => {
      // Create a circle polygon using points
      const center = [location.longitude, location.latitude];
      const radiusDegrees = milesToDegrees(revealRadiusMiles);
      const points = 32; // Number of points to approximate circle
      const coordinates: [number, number][] = [];

      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const lng = center[0] + radiusDegrees * Math.cos(angle) / Math.cos((center[1] * Math.PI) / 180);
        const lat = center[1] + radiusDegrees * Math.sin(angle);
        coordinates.push([lng, lat]);
      }

      return {
        type: 'Feature' as const,
        properties: { id: location.id },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coordinates],
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [visitedLocations, revealRadiusMiles]);

  // Generate fog overlay - a large polygon with holes for revealed areas
  const fogOverlayGeoJSON = useMemo(() => {
    // Create a world-covering polygon
    const worldBounds: [number, number][] = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];

    // Create holes for each revealed area
    const holes = visitedLocations.map((location) => {
      const center = [location.longitude, location.latitude];
      const radiusDegrees = milesToDegrees(revealRadiusMiles);
      const points = 32;
      const coordinates: [number, number][] = [];

      // Holes need to be in opposite winding order (clockwise)
      for (let i = points; i >= 0; i--) {
        const angle = (i / points) * 2 * Math.PI;
        const lng = center[0] + radiusDegrees * Math.cos(angle) / Math.cos((center[1] * Math.PI) / 180);
        const lat = center[1] + radiusDegrees * Math.sin(angle);
        coordinates.push([lng, lat]);
      }

      return coordinates;
    });

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [worldBounds, ...holes],
          },
        },
      ],
    };
  }, [visitedLocations, revealRadiusMiles]);

  // Current location marker GeoJSON
  const currentLocationGeoJSON = useMemo(() => {
    if (!currentLocation) return null;

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Point' as const,
            coordinates: [currentLocation.longitude, currentLocation.latitude],
          },
        },
      ],
    };
  }, [currentLocation]);

  // Current location reveal radius
  const currentLocationRadiusGeoJSON = useMemo(() => {
    if (!currentLocation) return null;

    const center = [currentLocation.longitude, currentLocation.latitude];
    const radiusDegrees = milesToDegrees(revealRadiusMiles);
    const points = 32;
    const coordinates: [number, number][] = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const lng = center[0] + radiusDegrees * Math.cos(angle) / Math.cos((center[1] * Math.PI) / 180);
      const lat = center[1] + radiusDegrees * Math.sin(angle);
      coordinates.push([lng, lat]);
    }

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: [coordinates],
          },
        },
      ],
    };
  }, [currentLocation, revealRadiusMiles]);

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={JSON.stringify(MAP_STYLE)}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: 8, right: 8 }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: DEFAULT_ZOOM,
          }}
        />

        {/* Fog of war overlay */}
        <MapLibreGL.ShapeSource id="fog-source" shape={fogOverlayGeoJSON}>
          <MapLibreGL.FillLayer
            id="fog-layer"
            style={{
              fillColor: 'rgba(30, 30, 30, 0.85)',
              fillOpacity: 1,
            }}
          />
        </MapLibreGL.ShapeSource>

        {/* Revealed area borders */}
        <MapLibreGL.ShapeSource id="revealed-borders-source" shape={revealedAreasGeoJSON}>
          <MapLibreGL.LineLayer
            id="revealed-borders-layer"
            style={{
              lineColor: 'rgba(76, 175, 80, 0.5)',
              lineWidth: 2,
            }}
          />
        </MapLibreGL.ShapeSource>

        {/* Current location radius indicator */}
        {currentLocationRadiusGeoJSON && (
          <MapLibreGL.ShapeSource id="current-radius-source" shape={currentLocationRadiusGeoJSON}>
            <MapLibreGL.FillLayer
              id="current-radius-fill"
              style={{
                fillColor: 'rgba(66, 133, 244, 0.15)',
                fillOpacity: 1,
              }}
            />
            <MapLibreGL.LineLayer
              id="current-radius-line"
              style={{
                lineColor: 'rgba(66, 133, 244, 0.5)',
                lineWidth: 2,
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Current location marker */}
        {currentLocationGeoJSON && (
          <MapLibreGL.ShapeSource id="current-location-source" shape={currentLocationGeoJSON}>
            <MapLibreGL.CircleLayer
              id="current-location-layer"
              style={{
                circleRadius: 8,
                circleColor: '#4285F4',
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 3,
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* User location indicator (native) */}
        <MapLibreGL.UserLocation visible={true} />
      </MapLibreGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
});
