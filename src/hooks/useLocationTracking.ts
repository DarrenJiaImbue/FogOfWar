import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { LocationPoint, RevealedGeometry } from '../types';
import {
  addVisitedLocation,
  isLocationSignificant,
  updateLastRecordedLocation,
  getRevealedGeometry,
  getLocationCount,
} from '../services/database';

interface UseLocationTrackingResult {
  currentLocation: LocationPoint | null;
  revealedGeometry: RevealedGeometry;
  locationCount: number;
  isTracking: boolean;
  hasPermission: boolean | null;
  errorMessage: string | null;
  locationOffset: LocationPoint;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  refreshRevealedGeometry: () => Promise<void>;
  adjustLocationOffset: (direction: 'north' | 'south' | 'east' | 'west', meters: number) => void;
  resetLocationOffset: () => void;
}

// Convert meters to degrees (approximate)
const metersToDegreesLat = (meters: number): number => meters / 111320;
const metersToDegreesLng = (meters: number, latitude: number): number =>
  meters / (111320 * Math.cos(latitude * Math.PI / 180));

export function useLocationTracking(): UseLocationTrackingResult {
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [revealedGeometry, setRevealedGeometry] = useState<RevealedGeometry>(null);
  const [locationCount, setLocationCount] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationOffset, setLocationOffset] = useState<LocationPoint>({ latitude: 0, longitude: 0 });

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const baseLocation = useRef<LocationPoint | null>(null);

  const refreshRevealedGeometry = useCallback(async () => {
    try {
      const [geometry, count] = await Promise.all([
        getRevealedGeometry(),
        getLocationCount(),
      ]);
      setRevealedGeometry(geometry);
      setLocationCount(count);
    } catch (error) {
      console.error('Error refreshing revealed geometry:', error);
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        setErrorMessage('Permission to access location was denied');
        setHasPermission(false);
        return false;
      }

      // Request background permission for continuous tracking
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      if (backgroundStatus !== 'granted') {
        // Still allow foreground tracking even if background is denied
        console.log('Background location permission denied, using foreground only');
      }

      setHasPermission(true);
      setErrorMessage(null);
      return true;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      setErrorMessage('Error requesting location permissions');
      setHasPermission(false);
      return false;
    }
  }, []);

  const handleLocationUpdate = useCallback(async (location: Location.LocationObject) => {
    try {
      const { latitude, longitude } = location.coords;

      // Store the base location from GPS
      baseLocation.current = { latitude, longitude };

      // Apply offset to get the displayed location
      setCurrentLocation({
        latitude: latitude + locationOffset.latitude,
        longitude: longitude + locationOffset.longitude,
      });

      // Check if this location is significantly different from the last one
      // Use the offset-adjusted location for recording
      const adjustedLat = latitude + locationOffset.latitude;
      const adjustedLng = longitude + locationOffset.longitude;

      if (isLocationSignificant(adjustedLat, adjustedLng, 0.02)) {
        await addVisitedLocation(adjustedLat, adjustedLng);
        updateLastRecordedLocation(adjustedLat, adjustedLng);
        await refreshRevealedGeometry();
      }
    } catch (error) {
      console.error('Error handling location update:', error);
    }
  }, [refreshRevealedGeometry, locationOffset]);

  const startTracking = useCallback(async () => {
    if (isTracking) return;

    const hasPerms = await requestPermissions();
    if (!hasPerms) return;

    try {
      // Load existing revealed geometry
      await refreshRevealedGeometry();

      // Get initial location
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await handleLocationUpdate(initialLocation);

      // Start watching for location updates
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10, // Update every 10 meters
          timeInterval: 5000, // Or every 5 seconds
        },
        handleLocationUpdate
      );

      setIsTracking(true);
      setErrorMessage(null);
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setErrorMessage('Error starting location tracking');
    }
  }, [isTracking, requestPermissions, handleLocationUpdate, refreshRevealedGeometry]);

  const stopTracking = useCallback(() => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setIsTracking(false);
  }, []);

  // Adjust location offset in a specific direction
  const adjustLocationOffset = useCallback(async (direction: 'north' | 'south' | 'east' | 'west', meters: number) => {
    // Use current location as base if we don't have a GPS base location yet
    const base = baseLocation.current ?? currentLocation;
    if (!base) {
      console.warn('No location available to offset from');
      return;
    }

    const currentLat = base.latitude;
    let latDelta = 0;
    let lngDelta = 0;

    switch (direction) {
      case 'north':
        latDelta = metersToDegreesLat(meters);
        break;
      case 'south':
        latDelta = -metersToDegreesLat(meters);
        break;
      case 'east':
        lngDelta = metersToDegreesLng(meters, currentLat);
        break;
      case 'west':
        lngDelta = -metersToDegreesLng(meters, currentLat);
        break;
    }

    setLocationOffset((prev) => {
      const newOffset = {
        latitude: prev.latitude + latDelta,
        longitude: prev.longitude + lngDelta,
      };

      // Update current location immediately with new offset
      const newLocation = {
        latitude: base.latitude + newOffset.latitude,
        longitude: base.longitude + newOffset.longitude,
      };
      setCurrentLocation(newLocation);

      // Record the new location to reveal fog (async, fire-and-forget)
      // Use a smaller threshold (0.005 miles = ~8 meters) for manual offset testing
      (async () => {
        try {
          if (isLocationSignificant(newLocation.latitude, newLocation.longitude, 0.005)) {
            await addVisitedLocation(newLocation.latitude, newLocation.longitude);
            updateLastRecordedLocation(newLocation.latitude, newLocation.longitude);
            await refreshRevealedGeometry();
          }
        } catch (error) {
          console.error('Error recording offset location:', error);
        }
      })();

      return newOffset;
    });
  }, [currentLocation, refreshRevealedGeometry]);

  // Reset location offset to zero
  const resetLocationOffset = useCallback(() => {
    setLocationOffset({ latitude: 0, longitude: 0 });
    if (baseLocation.current) {
      setCurrentLocation(baseLocation.current);
    }
  }, []);

  return {
    currentLocation,
    revealedGeometry,
    locationCount,
    isTracking,
    hasPermission,
    errorMessage,
    locationOffset,
    startTracking,
    stopTracking,
    refreshRevealedGeometry,
    adjustLocationOffset,
    resetLocationOffset,
  };
}
