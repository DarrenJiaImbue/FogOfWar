import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FogOfWarMap } from './src/components/FogOfWarMap';
import { ControlPanel } from './src/components/ControlPanel';
import { LocationOffsetControls } from './src/components/LocationOffsetControls';
import { SharePanel } from './src/components/SharePanel';
import { useLocationTracking } from './src/hooks/useLocationTracking';
import { useBluetooth } from './src/hooks/useBluetooth';
import {
  initDatabase,
  clearAllLocations,
  getSharedOnlyGeometry,
  getAllRevealedGeometry,
  getSharedStats,
} from './src/services/database';
import { RevealedGeometry } from './src/types';

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
  const [isSharePanelVisible, setIsSharePanelVisible] = useState(false);
  const [sharedOnlyGeometry, setSharedOnlyGeometry] = useState<RevealedGeometry>(null);
  const [allRevealedGeometry, setAllRevealedGeometry] = useState<RevealedGeometry>(null);
  const [sharedLocationCount, setSharedLocationCount] = useState(0);

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

  // Refresh all geometry (personal, shared, combined)
  const refreshAllGeometry = useCallback(async () => {
    try {
      await refreshRevealedGeometry();
      const sharedOnly = await getSharedOnlyGeometry();
      const allRevealed = await getAllRevealedGeometry();
      const sharedStats = await getSharedStats();

      setSharedOnlyGeometry(sharedOnly);
      setAllRevealedGeometry(allRevealed);
      setSharedLocationCount(sharedStats.locationCount);
    } catch (error) {
      console.error('Failed to refresh geometry:', error);
    }
  }, [refreshRevealedGeometry]);

  // Bluetooth hook - pass callback for when locations are received
  const {
    bluetoothState,
    isScanning,
    discoveredDevices,
    transferProgress,
    startScanning,
    stopScanningAction,
    connectAndShare,
    resetTransfer,
  } = useBluetooth(refreshAllGeometry);

  // Load revealed geometry on mount (now safe because DB is ready)
  useEffect(() => {
    refreshAllGeometry();
  }, [refreshAllGeometry]);

  const handleClearHistory = async () => {
    try {
      await clearAllLocations();
      await refreshAllGeometry();
    } catch (error) {
      console.error('Failed to clear location history:', error);
    }
  };

  const handleSharePress = () => {
    setIsSharePanelVisible(true);
  };

  const handleSharePanelClose = () => {
    setIsSharePanelVisible(false);
    stopScanningAction();
    resetTransfer();
  };

  return (
    <View style={styles.container}>
      <FogOfWarMap
        revealedGeometry={revealedGeometry}
        sharedOnlyGeometry={sharedOnlyGeometry}
        allRevealedGeometry={allRevealedGeometry}
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
        sharedLocationCount={sharedLocationCount}
        onStartTracking={startTracking}
        onStopTracking={stopTracking}
        onClearHistory={handleClearHistory}
        onSharePress={handleSharePress}
        errorMessage={errorMessage}
      />
      <SharePanel
        visible={isSharePanelVisible}
        onClose={handleSharePanelClose}
        bluetoothState={bluetoothState}
        isScanning={isScanning}
        discoveredDevices={discoveredDevices}
        transferProgress={transferProgress}
        onStartScanning={startScanning}
        onStopScanning={stopScanningAction}
        onDeviceSelect={connectAndShare}
        onReset={resetTransfer}
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
