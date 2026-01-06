import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { LocationPoint } from '../types';
import {
  addVisitedLocation,
  isLocationSignificant,
  getAllVisitedLocations,
} from '../services/database';
import { VisitedLocation } from '../types';

interface UseLocationTrackingResult {
  currentLocation: LocationPoint | null;
  visitedLocations: VisitedLocation[];
  isTracking: boolean;
  hasPermission: boolean | null;
  errorMessage: string | null;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  refreshVisitedLocations: () => Promise<void>;
}

export function useLocationTracking(): UseLocationTrackingResult {
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [visitedLocations, setVisitedLocations] = useState<VisitedLocation[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const refreshVisitedLocations = useCallback(async () => {
    try {
      const locations = await getAllVisitedLocations();
      setVisitedLocations(locations);
    } catch (error) {
      console.error('Error refreshing visited locations:', error);
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
      const { latitude, longitude, accuracy } = location.coords;

      setCurrentLocation({ latitude, longitude });

      // Check if this location is significantly different from existing ones
      const isSignificant = await isLocationSignificant(latitude, longitude, 0.02);

      if (isSignificant) {
        await addVisitedLocation(latitude, longitude, accuracy);
        await refreshVisitedLocations();
      }
    } catch (error) {
      console.error('Error handling location update:', error);
      // Don't set error message here to avoid spamming user with errors
      // during continuous location updates
    }
  }, [refreshVisitedLocations]);

  const startTracking = useCallback(async () => {
    if (isTracking) return;

    const hasPerms = await requestPermissions();
    if (!hasPerms) return;

    try {
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
  }, [isTracking, requestPermissions, handleLocationUpdate]);

  const stopTracking = useCallback(() => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setIsTracking(false);
  }, []);

  // Load visited locations on mount
  useEffect(() => {
    refreshVisitedLocations();
  }, [refreshVisitedLocations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  return {
    currentLocation,
    visitedLocations,
    isTracking,
    hasPermission,
    errorMessage,
    startTracking,
    stopTracking,
    refreshVisitedLocations,
  };
}
