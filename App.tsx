import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FogOfWarMap } from './src/components/FogOfWarMap';
import { ControlPanel } from './src/components/ControlPanel';
import { LocationOffsetControls } from './src/components/LocationOffsetControls';
import { useLocationTracking } from './src/hooks/useLocationTracking';
import { initDatabase, clearAllLocations } from './src/services/database';

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

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

  // Only render the main app after database is ready
  return <MainApp />;
}

function MainApp() {
  const {
    currentLocation,
    revealedGeometry,
    locationCount,
    isTracking,
    errorMessage,
    locationOffset,
    startTracking,
    stopTracking,
    refreshRevealedGeometry,
    adjustLocationOffset,
    resetLocationOffset,
  } = useLocationTracking();

  // Load revealed geometry on mount (now safe because DB is ready)
  useEffect(() => {
    refreshRevealedGeometry();
  }, [refreshRevealedGeometry]);

  const handleClearHistory = async () => {
    try {
      await clearAllLocations();
      await refreshRevealedGeometry();
    } catch (error) {
      console.error('Failed to clear location history:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FogOfWarMap
        revealedGeometry={revealedGeometry}
        currentLocation={currentLocation}
        revealRadiusMiles={0.1}
      />
      <LocationOffsetControls
        locationOffset={locationOffset}
        onAdjust={adjustLocationOffset}
        onReset={resetLocationOffset}
        stepMeters={10}
      />
      <ControlPanel
        isTracking={isTracking}
        locationCount={locationCount}
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
