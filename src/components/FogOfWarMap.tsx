import React, { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import MapLibreGL, { type MapViewRef, type CameraRef } from '@maplibre/maplibre-react-native';
import { LocationPoint, RevealedGeometry } from '../types';

// Import paper texture
const paperTexture = require('../../assets/paper-texture.jpg');

// Initialize MapLibre
MapLibreGL.setAccessToken(null);

interface FogOfWarMapProps {
  revealedGeometry: RevealedGeometry;
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
  revealedGeometry,
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

  // Initial center based on current location or default
  const initialCenter = useMemo((): [number, number] => {
    if (currentLocation) {
      return [currentLocation.longitude, currentLocation.latitude];
    }
    return DEFAULT_CENTER;
  }, [currentLocation]);

  // Generate fog overlay - a world polygon with the revealed area cut out
  const fogOverlayGeoJSON = useMemo(() => {
    // World-covering polygon bounds
    const worldBounds: [number, number][] = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];

    if (!revealedGeometry) {
      // No revealed areas yet - full fog
      return {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'Polygon' as const,
              coordinates: [worldBounds],
            },
          },
        ],
      };
    }

    // Create holes from the revealed geometry
    const revealedCoords = revealedGeometry.geometry.coordinates;
    let holes: [number, number][][];

    if (revealedGeometry.geometry.type === 'Polygon') {
      // Single polygon - reverse winding for hole
      holes = [reverseCoordinates(revealedCoords[0] as [number, number][])];
    } else {
      // MultiPolygon - each polygon becomes a hole
      holes = (revealedCoords as [number, number][][][]).map(
        (polygon) => reverseCoordinates(polygon[0])
      );
    }

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
  }, [revealedGeometry]);

  // Border around revealed areas for visual effect
  const revealedBorderGeoJSON = useMemo(() => {
    if (!revealedGeometry) return null;

    return {
      type: 'FeatureCollection' as const,
      features: [revealedGeometry],
    };
  }, [revealedGeometry]);

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

  // Current location reveal radius indicator
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

        {/* Load paper texture image for fog pattern */}
        <MapLibreGL.Images
          images={{ paperTexture }}
          onImageMissing={() => {
            // Image loading is handled automatically
          }}
        />

        {/* Fog of war overlay with paper texture */}
        <MapLibreGL.ShapeSource id="fog-source" shape={fogOverlayGeoJSON}>
          <MapLibreGL.FillLayer
            id="fog-layer"
            style={{
              fillPattern: 'paperTexture',
              fillOpacity: 1.0,
            }}
          />
        </MapLibreGL.ShapeSource>

        {/* Revealed area border */}
        {revealedBorderGeoJSON && (
          <MapLibreGL.ShapeSource id="revealed-border-source" shape={revealedBorderGeoJSON}>
            <MapLibreGL.LineLayer
              id="revealed-border-layer"
              style={{
                lineColor: 'rgba(76, 175, 80, 0.5)',
                lineWidth: 2,
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

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

        {/* Current location marker (uses offset-adjusted location) */}
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
      </MapLibreGL.MapView>
    </View>
  );
}

/**
 * Reverse coordinate winding order (needed for polygon holes)
 */
function reverseCoordinates(coords: [number, number][]): [number, number][] {
  return [...coords].reverse();
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
