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

// Number of blur/transition layers for smooth edge effect
const BLUR_LAYERS = 6;
// Total distance of blur effect in miles (how far the gradient extends into revealed area)
const BLUR_DISTANCE_MILES = 0.03;

/**
 * Expand or contract a polygon ring by a given distance in miles.
 * Positive distance expands outward, negative contracts inward.
 * Uses a simple offset approach for each vertex.
 */
function offsetPolygonRing(
  ring: [number, number][],
  distanceMiles: number,
  expandOutward: boolean = true
): [number, number][] {
  if (ring.length < 3) return ring;

  const distanceDegrees = milesToDegrees(distanceMiles);
  const direction = expandOutward ? 1 : -1;
  const result: [number, number][] = [];

  for (let i = 0; i < ring.length - 1; i++) {
    const prev = ring[i === 0 ? ring.length - 2 : i - 1];
    const curr = ring[i];
    const next = ring[(i + 1) % (ring.length - 1)];

    // Calculate vectors to neighbors
    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];

    // Normalize and get perpendicular (outward normal)
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    // Perpendicular vectors (pointing outward for CCW winding)
    const nx1 = -dy1 / len1;
    const ny1 = dx1 / len1;
    const nx2 = -dy2 / len2;
    const ny2 = dx2 / len2;

    // Average the normals for smooth corners
    let nx = (nx1 + nx2) / 2;
    let ny = (ny1 + ny2) / 2;
    const nLen = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nLen;
    ny /= nLen;

    // Adjust for latitude (longitude degrees are smaller near poles)
    const latRadians = (curr[1] * Math.PI) / 180;
    const lngAdjust = 1 / Math.cos(latRadians);

    result.push([
      curr[0] + direction * nx * distanceDegrees * lngAdjust,
      curr[1] + direction * ny * distanceDegrees,
    ]);
  }

  // Close the ring
  result.push(result[0]);
  return result;
}

/**
 * Create a GeoJSON FeatureCollection with a world-covering polygon and holes
 */
function createFeatureCollection(
  worldBounds: [number, number][],
  holes: [number, number][][]
) {
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
}

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

  // Generate blur transition layers - each layer has holes that are progressively smaller
  // This creates a gradient effect from revealed (transparent) to fog (opaque)
  const blurLayersGeoJSON = useMemo(() => {
    if (!revealedGeometry) return [];

    const worldBounds: [number, number][] = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];

    const layers: Array<{
      geojson: ReturnType<typeof createFeatureCollection>;
      opacity: number;
    }> = [];

    const revealedCoords = revealedGeometry.geometry.coordinates;
    const isMultiPolygon = revealedGeometry.geometry.type === 'MultiPolygon';

    // Create blur layers from outermost (most transparent) to innermost (before main fog)
    for (let i = 0; i < BLUR_LAYERS; i++) {
      // Distance to contract the hole inward (larger = smaller hole = more fog showing)
      const contractDistance = (BLUR_DISTANCE_MILES / BLUR_LAYERS) * (i + 1);

      // Opacity increases as we go inward (closer to the fog)
      // Use a smooth curve for more natural transition
      const t = (i + 1) / (BLUR_LAYERS + 1);
      const opacity = t * t * 0.85; // Quadratic ease-in, max 0.85 to match main fog

      let holes: [number, number][][];

      if (isMultiPolygon) {
        holes = (revealedCoords as [number, number][][][]).map((polygon) => {
          const contracted = offsetPolygonRing(polygon[0], contractDistance, false);
          return reverseCoordinates(contracted);
        });
      } else {
        const contracted = offsetPolygonRing(
          revealedCoords[0] as [number, number][],
          contractDistance,
          false
        );
        holes = [reverseCoordinates(contracted)];
      }

      layers.push({
        geojson: createFeatureCollection(worldBounds, holes),
        opacity,
      });
    }

    return layers;
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

        {/* Blur transition layers - rendered from outermost to innermost */}
        {blurLayersGeoJSON.map((layer, index) => (
          <MapLibreGL.ShapeSource
            key={`blur-source-${index}`}
            id={`blur-source-${index}`}
            shape={layer.geojson}
          >
            <MapLibreGL.FillLayer
              id={`blur-layer-${index}`}
              style={{
                fillPattern: 'paperTexture',
                fillOpacity: layer.opacity,
              }}
            />
          </MapLibreGL.ShapeSource>
        ))}

        {/* Main fog of war overlay with paper texture */}
        <MapLibreGL.ShapeSource id="fog-source" shape={fogOverlayGeoJSON}>
          <MapLibreGL.FillLayer
            id="fog-layer"
            style={{
              fillPattern: 'paperTexture',
              fillOpacity: 0.92,
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
