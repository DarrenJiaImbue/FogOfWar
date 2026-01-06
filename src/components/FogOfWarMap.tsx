import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import MapView, { Circle, Overlay, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { VisitedLocation, LocationPoint, MapRegion } from '../types';

interface FogOfWarMapProps {
  visitedLocations: VisitedLocation[];
  currentLocation: LocationPoint | null;
  revealRadiusMiles?: number;
}

// Convert miles to meters for Circle radius
const milesToMeters = (miles: number): number => miles * 1609.34;

// Convert miles to latitude degrees (approximate)
const milesToLatDelta = (miles: number): number => miles / 69;

// Convert miles to longitude degrees (varies with latitude)
const milesToLonDelta = (miles: number, latitude: number): number => {
  return miles / (69 * Math.cos((latitude * Math.PI) / 180));
};

// Default location (San Francisco) if no location available
const DEFAULT_REGION: MapRegion = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export function FogOfWarMap({
  visitedLocations,
  currentLocation,
  revealRadiusMiles = 0.1,
}: FogOfWarMapProps) {
  const mapRef = useRef<MapView>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(DEFAULT_REGION);

  // Calculate the revealed circles
  const revealedCircles = useMemo(() => {
    return visitedLocations.map((location) => ({
      id: location.id,
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      radius: milesToMeters(revealRadiusMiles),
    }));
  }, [visitedLocations, revealRadiusMiles]);

  // Center map on current location when it changes
  useEffect(() => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }
  }, [currentLocation]);

  // Initial region based on current location or visited locations
  const initialRegion = useMemo((): MapRegion => {
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    if (visitedLocations.length > 0) {
      const latestLocation = visitedLocations[0];
      return {
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    return DEFAULT_REGION;
  }, [currentLocation, visitedLocations]);

  const handleRegionChange = useCallback((region: Region) => {
    setMapRegion(region);
  }, []);

  // Create fog overlay tiles - we use a grid of semi-transparent dark circles
  // that are "cut out" by the revealed areas
  const fogTiles = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;

    // Create a fog grid that covers the visible area plus some padding
    const fogCells: Array<{
      id: string;
      center: { latitude: number; longitude: number };
      isRevealed: boolean;
    }> = [];

    // Grid resolution - smaller values = more detailed fog but more rendering overhead
    const gridSize = 0.002; // Approximately 0.14 miles or 220 meters per cell

    const startLat = latitude - latitudeDelta - 0.01;
    const endLat = latitude + latitudeDelta + 0.01;
    const startLon = longitude - longitudeDelta - 0.01;
    const endLon = longitude + longitudeDelta + 0.01;

    for (let lat = startLat; lat <= endLat; lat += gridSize) {
      for (let lon = startLon; lon <= endLon; lon += gridSize) {
        // Check if this cell is revealed by any visited location
        const isRevealed = visitedLocations.some((location) => {
          const latDiff = Math.abs(lat - location.latitude);
          const lonDiff = Math.abs(lon - location.longitude);

          // Quick bounding box check first
          const revealLatDelta = milesToLatDelta(revealRadiusMiles);
          const revealLonDelta = milesToLonDelta(revealRadiusMiles, lat);

          if (latDiff > revealLatDelta || lonDiff > revealLonDelta) {
            return false;
          }

          // More accurate circular check
          const distanceSquared =
            Math.pow(latDiff * 69, 2) +
            Math.pow(lonDiff * 69 * Math.cos((lat * Math.PI) / 180), 2);

          return distanceSquared <= Math.pow(revealRadiusMiles, 2);
        });

        if (!isRevealed) {
          fogCells.push({
            id: `fog-${lat.toFixed(6)}-${lon.toFixed(6)}`,
            center: { latitude: lat, longitude: lon },
            isRevealed: false,
          });
        }
      }
    }

    return fogCells;
  }, [mapRegion, visitedLocations, revealRadiusMiles]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      >
        {/* Fog of war overlay - dark circles covering unexplored areas */}
        {fogTiles.map((tile) => (
          <Circle
            key={tile.id}
            center={tile.center}
            radius={150} // Radius in meters for fog cells
            fillColor="rgba(30, 30, 30, 0.85)"
            strokeColor="transparent"
            strokeWidth={0}
          />
        ))}

        {/* Current location marker with glow effect */}
        {currentLocation && (
          <>
            <Circle
              key="current-location-glow"
              center={currentLocation}
              radius={milesToMeters(revealRadiusMiles)}
              fillColor="rgba(66, 133, 244, 0.15)"
              strokeColor="rgba(66, 133, 244, 0.5)"
              strokeWidth={2}
            />
          </>
        )}

        {/* Revealed area borders (optional visual enhancement) */}
        {revealedCircles.map((circle) => (
          <Circle
            key={`reveal-border-${circle.id}`}
            center={circle.center}
            radius={circle.radius}
            fillColor="transparent"
            strokeColor="rgba(76, 175, 80, 0.3)"
            strokeWidth={1}
          />
        ))}
      </MapView>
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
