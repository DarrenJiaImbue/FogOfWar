import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import {
  initBluetooth,
  destroyBluetooth,
  requestBluetoothPermissions,
  getBluetoothState,
  onBluetoothStateChange,
  scanForDevices,
  stopScanning,
  exchangeLocations,
} from '../services/bluetooth';
import {
  DiscoveredDevice,
  BluetoothState,
  TransferState,
  TransferProgress,
} from '../types';

interface UseBluetoothResult {
  // State
  bluetoothState: BluetoothState;
  isScanning: boolean;
  discoveredDevices: DiscoveredDevice[];
  transferProgress: TransferProgress;
  permissionsGranted: boolean;

  // Actions
  requestPermissions: () => Promise<boolean>;
  startScanning: () => Promise<void>;
  stopScanningAction: () => void;
  connectAndShare: (deviceId: string) => Promise<void>;
  resetTransfer: () => void;
}

export function useBluetooth(
  onLocationsReceived?: () => void
): UseBluetoothResult {
  const [bluetoothState, setBluetoothState] = useState<BluetoothState>('unknown');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [transferProgress, setTransferProgress] = useState<TransferProgress>({
    state: 'idle',
    currentChunk: 0,
    totalChunks: 0,
  });

  const stopScanRef = useRef<(() => void) | null>(null);

  // Initialize Bluetooth on mount
  useEffect(() => {
    initBluetooth();

    // Check initial state
    getBluetoothState().then(setBluetoothState);

    // Subscribe to state changes
    const unsubscribe = onBluetoothStateChange(setBluetoothState);

    return () => {
      unsubscribe();
      if (stopScanRef.current) {
        stopScanRef.current();
      }
      destroyBluetooth();
    };
  }, []);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const granted = await requestBluetoothPermissions();
    setPermissionsGranted(granted);

    if (!granted) {
      Alert.alert(
        'Bluetooth Permission Required',
        'Please grant Bluetooth permissions to share locations with nearby users.',
        [{ text: 'OK' }]
      );
    }

    return granted;
  }, []);

  // Start scanning for nearby devices
  const startScanning = useCallback(async () => {
    // Check permissions first
    if (!permissionsGranted) {
      const granted = await requestPermissions();
      if (!granted) return;
    }

    // Check Bluetooth is on
    if (bluetoothState !== 'poweredOn') {
      Alert.alert(
        'Bluetooth Required',
        'Please turn on Bluetooth to share locations with nearby users.',
        [{ text: 'OK' }]
      );
      return;
    }

    setDiscoveredDevices([]);
    setIsScanning(true);
    setTransferProgress({ state: 'scanning', currentChunk: 0, totalChunks: 0 });

    stopScanRef.current = scanForDevices(
      (device) => {
        setDiscoveredDevices((prev) => {
          // Avoid duplicates
          if (prev.some((d) => d.id === device.id)) {
            return prev;
          }
          return [...prev, device];
        });
      },
      (error) => {
        console.error('Scan error:', error);
        setIsScanning(false);
        setTransferProgress({
          state: 'error',
          currentChunk: 0,
          totalChunks: 0,
          errorMessage: error.message,
        });
      }
    );

    // Auto-stop scanning after 30 seconds
    setTimeout(() => {
      if (stopScanRef.current) {
        stopScanRef.current();
        stopScanRef.current = null;
        setIsScanning(false);
        if (transferProgress.state === 'scanning') {
          setTransferProgress({ state: 'idle', currentChunk: 0, totalChunks: 0 });
        }
      }
    }, 30000);
  }, [permissionsGranted, bluetoothState, requestPermissions, transferProgress.state]);

  // Stop scanning
  const stopScanningAction = useCallback(() => {
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
    stopScanning();
    setIsScanning(false);
    setTransferProgress({ state: 'idle', currentChunk: 0, totalChunks: 0 });
  }, []);

  // Connect to a device and share locations
  const connectAndShare = useCallback(async (deviceId: string) => {
    // Stop scanning first
    stopScanningAction();

    setTransferProgress({ state: 'connecting', currentChunk: 0, totalChunks: 0 });

    try {
      const result = await exchangeLocations(
        deviceId,
        (message, progress) => {
          // Parse progress message to determine state
          let state: TransferState = 'transferring';
          if (message.includes('Connecting')) {
            state = 'connecting';
          } else if (message.includes('Complete')) {
            state = 'completed';
          }

          // Extract chunk info if available
          const chunkMatch = message.match(/(\d+)\/(\d+)/);
          const currentChunk = chunkMatch ? parseInt(chunkMatch[1], 10) : 0;
          const totalChunks = chunkMatch ? parseInt(chunkMatch[2], 10) : 0;

          setTransferProgress({
            state,
            currentChunk,
            totalChunks,
          });
        }
      );

      setTransferProgress({
        state: 'completed',
        currentChunk: 0,
        totalChunks: 0,
      });

      // Notify parent that new locations were received
      if (result.received > 0 && onLocationsReceived) {
        onLocationsReceived();
      }

      Alert.alert(
        'Share Complete!',
        `Sent ${result.sent} locations\nReceived ${result.received} new locations`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTransferProgress({
        state: 'error',
        currentChunk: 0,
        totalChunks: 0,
        errorMessage,
      });

      Alert.alert('Share Failed', errorMessage, [{ text: 'OK' }]);
    }
  }, [stopScanningAction, onLocationsReceived]);

  // Reset transfer state
  const resetTransfer = useCallback(() => {
    setTransferProgress({ state: 'idle', currentChunk: 0, totalChunks: 0 });
    setDiscoveredDevices([]);
  }, []);

  return {
    bluetoothState,
    isScanning,
    discoveredDevices,
    transferProgress,
    permissionsGranted,
    requestPermissions,
    startScanning,
    stopScanningAction,
    connectAndShare,
    resetTransfer,
  };
}
