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
    console.log('[useBluetooth] Hook mounted, initializing Bluetooth');
    initBluetooth();

    // Check initial state
    console.log('[useBluetooth] Checking initial Bluetooth state');
    getBluetoothState().then((state) => {
      console.log('[useBluetooth] Initial Bluetooth state:', state);
      setBluetoothState(state);
    });

    // Subscribe to state changes
    console.log('[useBluetooth] Subscribing to state changes');
    const unsubscribe = onBluetoothStateChange((state) => {
      console.log('[useBluetooth] Bluetooth state changed to:', state);
      setBluetoothState(state);
    });

    return () => {
      console.log('[useBluetooth] Hook unmounting, cleaning up');
      unsubscribe();
      if (stopScanRef.current) {
        console.log('[useBluetooth] Stopping active scan on unmount');
        stopScanRef.current();
      }
      destroyBluetooth();
      console.log('[useBluetooth] Cleanup complete');
    };
  }, []);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    console.log('[useBluetooth] Requesting Bluetooth permissions');
    const granted = await requestBluetoothPermissions();
    console.log('[useBluetooth] Permissions granted:', granted);
    setPermissionsGranted(granted);

    if (!granted) {
      console.log('[useBluetooth] Permissions denied, showing alert');
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
    console.log('[useBluetooth] startScanning() called');
    console.log('[useBluetooth] Current state - permissionsGranted:', permissionsGranted, 'bluetoothState:', bluetoothState);

    // Check permissions first
    if (!permissionsGranted) {
      console.log('[useBluetooth] Permissions not granted, requesting...');
      const granted = await requestPermissions();
      if (!granted) {
        console.log('[useBluetooth] Permissions request failed, aborting scan');
        return;
      }
    }

    // Check Bluetooth is on
    if (bluetoothState !== 'poweredOn') {
      console.log('[useBluetooth] Bluetooth not powered on (state:', bluetoothState, '), showing alert');
      Alert.alert(
        'Bluetooth Required',
        'Please turn on Bluetooth to share locations with nearby users.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('[useBluetooth] Starting scan - clearing discovered devices, setting isScanning=true');
    setDiscoveredDevices([]);
    setIsScanning(true);
    setTransferProgress({ state: 'scanning', currentChunk: 0, totalChunks: 0 });

    console.log('[useBluetooth] Calling scanForDevices()');
    stopScanRef.current = scanForDevices(
      (device) => {
        console.log('[useBluetooth] onDeviceFound callback - device:', device.id, device.name);
        setDiscoveredDevices((prev) => {
          // Avoid duplicates
          if (prev.some((d) => d.id === device.id)) {
            console.log('[useBluetooth] Device already in list, skipping:', device.id);
            return prev;
          }
          console.log('[useBluetooth] Adding new device to list:', device.id, '- total devices:', prev.length + 1);
          return [...prev, device];
        });
      },
      (error) => {
        console.error('[useBluetooth] Scan error callback:', error.message);
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
    console.log('[useBluetooth] Setting 30-second auto-stop timer');
    setTimeout(() => {
      console.log('[useBluetooth] Auto-stop timer fired');
      if (stopScanRef.current) {
        console.log('[useBluetooth] Auto-stopping scan after 30 seconds');
        stopScanRef.current();
        stopScanRef.current = null;
        setIsScanning(false);
        if (transferProgress.state === 'scanning') {
          console.log('[useBluetooth] Resetting transfer progress to idle');
          setTransferProgress({ state: 'idle', currentChunk: 0, totalChunks: 0 });
        }
      } else {
        console.log('[useBluetooth] No active scan to stop (already stopped)');
      }
    }, 30000);
  }, [permissionsGranted, bluetoothState, requestPermissions, transferProgress.state]);

  // Stop scanning
  const stopScanningAction = useCallback(() => {
    console.log('[useBluetooth] stopScanningAction() called');
    if (stopScanRef.current) {
      console.log('[useBluetooth] Calling stop function from scanForDevices');
      stopScanRef.current();
      stopScanRef.current = null;
    } else {
      console.log('[useBluetooth] No active scan reference to stop');
    }
    stopScanning();
    setIsScanning(false);
    setTransferProgress({ state: 'idle', currentChunk: 0, totalChunks: 0 });
    console.log('[useBluetooth] Scan stopped, state reset to idle');
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
