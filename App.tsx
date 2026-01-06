import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FogOfWarMap } from './src/components/FogOfWarMap';
import { ControlPanel } from './src/components/ControlPanel';
import { useLocationTracking } from './src/hooks/useLocationTracking';
import { initDatabase, clearAllLocations } from './src/services/database';

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const {
    currentLocation,
    visitedLocations,
    isTracking,
    errorMessage,
    startTracking,
    stopTracking,
    refreshVisitedLocations,
  } = useLocationTracking();

  // Initialize database on app start
  useEffect(() => {
    const setupDatabase = async () => {
      try {
        await initDatabase();
        setIsDbReady(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setDbError('Failed to initialize database');
      }
    };

    setupDatabase();
  }, []);

  const handleClearHistory = async () => {
    try {
      await clearAllLocations();
      await refreshVisitedLocations();
    } catch (error) {
      console.error('Failed to clear location history:', error);
    }
  };

  // Show loading state while database initializes
  if (!isDbReady) {
    return (
      <View style={styles.loadingContainer}>
        {dbError ? (
          <Text style={styles.errorText}>{dbError}</Text>
        ) : (
          <>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Initializing...</Text>
          </>
        )}
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FogOfWarMap
        visitedLocations={visitedLocations}
        currentLocation={currentLocation}
        revealRadiusMiles={0.1}
      />
      <ControlPanel
        isTracking={isTracking}
        locationCount={visitedLocations.length}
        onStartTracking={startTracking}
        onStopTracking={stopTracking}
        onClearHistory={handleClearHistory}
        errorMessage={errorMessage}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
