import { BleManager, Device, State, BleError, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';
import {
  DiscoveredDevice,
  BluetoothState,
  LocationExportData,
} from '../types';
import { exportLocationHistory, importSharedLocations } from './database';

// Custom UUIDs for our Fog of War service
const FOG_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const LOCATION_DATA_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const TRANSFER_CONTROL_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';

// Transfer commands
const CMD_REQUEST_DATA = 'REQ';
const CMD_DATA_START = 'START';
const CMD_DATA_CHUNK = 'CHUNK';
const CMD_DATA_END = 'END';
const CMD_ACK = 'ACK';

// Chunk size for data transfer (conservative, works with default MTU)
const CHUNK_SIZE = 180;

let bleManager: BleManager | null = null;

/**
 * Initialize the BLE manager
 */
export function initBluetooth(): BleManager {
  if (!bleManager) {
    console.log('[Bluetooth] Initializing BLE manager');
    bleManager = new BleManager();
    console.log('[Bluetooth] BLE manager initialized successfully');
  } else {
    console.log('[Bluetooth] BLE manager already initialized');
  }
  return bleManager;
}

/**
 * Destroy the BLE manager (cleanup)
 */
export function destroyBluetooth(): void {
  if (bleManager) {
    bleManager.destroy();
    bleManager = null;
  }
}

/**
 * Get the BLE manager instance
 */
export function getBleManager(): BleManager {
  if (!bleManager) {
    return initBluetooth();
  }
  return bleManager;
}

/**
 * Request Bluetooth permissions (Android only)
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  console.log('[Bluetooth] Requesting permissions, platform:', Platform.OS);

  if (Platform.OS === 'ios') {
    // iOS permissions are handled through Info.plist
    console.log('[Bluetooth] iOS platform - permissions handled via Info.plist');
    return true;
  }

  if (Platform.OS === 'android') {
    const apiLevel = Platform.Version;
    console.log('[Bluetooth] Android API level:', apiLevel);

    if (apiLevel >= 31) {
      // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
      console.log('[Bluetooth] Android 12+ - requesting BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE, ACCESS_FINE_LOCATION');
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      console.log('[Bluetooth] Permission results:', JSON.stringify(results, null, 2));

      const granted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';

      console.log('[Bluetooth] All required permissions granted:', granted);
      return granted;
    } else {
      // Android < 12 just needs location permission for BLE scanning
      console.log('[Bluetooth] Android < 12 - requesting ACCESS_FINE_LOCATION only');
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      console.log('[Bluetooth] Location permission result:', result);
      return result === 'granted';
    }
  }

  console.log('[Bluetooth] Unknown platform, returning false');
  return false;
}

/**
 * Check current Bluetooth state
 */
export async function getBluetoothState(): Promise<BluetoothState> {
  const manager = getBleManager();
  const state = await manager.state();
  const mappedState = mapBleState(state);
  console.log('[Bluetooth] Current state:', state, '-> mapped to:', mappedState);
  return mappedState;
}

/**
 * Subscribe to Bluetooth state changes
 */
export function onBluetoothStateChange(
  callback: (state: BluetoothState) => void
): () => void {
  console.log('[Bluetooth] Subscribing to state changes');
  const manager = getBleManager();
  const subscription = manager.onStateChange((state) => {
    const mappedState = mapBleState(state);
    console.log('[Bluetooth] State changed:', state, '-> mapped to:', mappedState);
    callback(mappedState);
  }, true);

  return () => {
    console.log('[Bluetooth] Unsubscribing from state changes');
    subscription.remove();
  };
}

function mapBleState(state: State): BluetoothState {
  switch (state) {
    case State.Unknown:
      return 'unknown';
    case State.Resetting:
      return 'resetting';
    case State.Unsupported:
      return 'unsupported';
    case State.Unauthorized:
      return 'unauthorized';
    case State.PoweredOff:
      return 'poweredOff';
    case State.PoweredOn:
      return 'poweredOn';
    default:
      return 'unknown';
  }
}

/**
 * Scan for nearby devices running Fog of War
 */
export function scanForDevices(
  onDeviceFound: (device: DiscoveredDevice) => void,
  onError: (error: BleError) => void
): () => void {
  const manager = getBleManager();
  const discoveredIds = new Set<string>();

  console.log('[Bluetooth] Starting device scan');
  console.log('[Bluetooth] Scanning for service UUID:', FOG_SERVICE_UUID);
  console.log('[Bluetooth] Scan options: allowDuplicates=false');

  manager.startDeviceScan(
    [FOG_SERVICE_UUID],
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        console.error('[Bluetooth] Scan error:', error.message, 'errorCode:', error.errorCode, 'reason:', error.reason);
        onError(error);
        return;
      }

      if (device) {
        console.log('[Bluetooth] Device detected:', {
          id: device.id,
          name: device.name,
          localName: device.localName,
          rssi: device.rssi,
          isConnectable: device.isConnectable,
          serviceUUIDs: device.serviceUUIDs,
          manufacturerData: device.manufacturerData,
        });

        if (!discoveredIds.has(device.id)) {
          console.log('[Bluetooth] New device discovered (not seen before):', device.id);
          discoveredIds.add(device.id);
          const discoveredDevice: DiscoveredDevice = {
            id: device.id,
            name: device.name || device.localName || 'Fog of War User',
            rssi: device.rssi,
          };
          console.log('[Bluetooth] Reporting discovered device:', discoveredDevice);
          onDeviceFound(discoveredDevice);
        } else {
          console.log('[Bluetooth] Device already discovered, skipping:', device.id);
        }
      }
    }
  );

  console.log('[Bluetooth] Scan started, returning stop function');

  return () => {
    console.log('[Bluetooth] Stopping device scan');
    console.log('[Bluetooth] Total unique devices found:', discoveredIds.size);
    manager.stopDeviceScan();
    console.log('[Bluetooth] Device scan stopped');
  };
}

/**
 * Stop scanning for devices
 */
export function stopScanning(): void {
  console.log('[Bluetooth] stopScanning() called');
  const manager = getBleManager();
  manager.stopDeviceScan();
  console.log('[Bluetooth] Scan stopped via stopScanning()');
}

/**
 * Connect to a device and exchange location data
 * This performs a bidirectional sync:
 * 1. Send our locations to them
 * 2. Receive their locations
 */
export async function exchangeLocations(
  deviceId: string,
  onProgress: (message: string, progress: number) => void
): Promise<{ sent: number; received: number }> {
  const manager = getBleManager();
  let device: Device | null = null;

  try {
    onProgress('Connecting...', 0);

    // Connect to the device
    device = await manager.connectToDevice(deviceId, {
      requestMTU: 512,
      timeout: 10000,
    });

    onProgress('Discovering services...', 0.1);

    // Discover services and characteristics
    await device.discoverAllServicesAndCharacteristics();

    onProgress('Preparing data...', 0.2);

    // Get our location data to send
    const ourData = await exportLocationHistory();
    const dataString = JSON.stringify(ourData);
    const chunks = chunkString(dataString, CHUNK_SIZE);

    onProgress('Sending locations...', 0.3);

    // Send our data
    await sendLocationData(device, chunks, (chunkIndex, totalChunks) => {
      const progress = 0.3 + (0.3 * chunkIndex / totalChunks);
      onProgress(`Sending chunk ${chunkIndex + 1}/${totalChunks}`, progress);
    });

    onProgress('Receiving locations...', 0.6);

    // Request and receive their data
    const receivedData = await receiveLocationData(device, (chunkIndex, totalChunks) => {
      const progress = 0.6 + (0.3 * chunkIndex / totalChunks);
      onProgress(`Receiving chunk ${chunkIndex + 1}/${totalChunks}`, progress);
    });

    onProgress('Importing locations...', 0.9);

    // Import received locations
    let receivedCount = 0;
    if (receivedData && receivedData.locations.length > 0) {
      receivedCount = await importSharedLocations(receivedData.locations);
    }

    onProgress('Complete!', 1);

    return {
      sent: ourData.locations.length,
      received: receivedCount,
    };
  } finally {
    // Always disconnect
    if (device) {
      try {
        await manager.cancelDeviceConnection(deviceId);
      } catch (e) {
        // Ignore disconnection errors
      }
    }
  }
}

/**
 * Send location data to connected device in chunks
 */
async function sendLocationData(
  device: Device,
  chunks: string[],
  onChunkSent: (chunkIndex: number, totalChunks: number) => void
): Promise<void> {
  const totalChunks = chunks.length;

  // Send START command with total chunk count
  await writeCharacteristic(
    device,
    TRANSFER_CONTROL_CHAR_UUID,
    `${CMD_DATA_START}:${totalChunks}`
  );

  // Send each chunk
  for (let i = 0; i < chunks.length; i++) {
    await writeCharacteristic(
      device,
      LOCATION_DATA_CHAR_UUID,
      `${CMD_DATA_CHUNK}:${i}:${chunks[i]}`
    );
    onChunkSent(i, totalChunks);

    // Small delay to prevent overwhelming the receiver
    await sleep(50);
  }

  // Send END command
  await writeCharacteristic(device, TRANSFER_CONTROL_CHAR_UUID, CMD_DATA_END);
}

/**
 * Receive location data from connected device
 */
async function receiveLocationData(
  device: Device,
  onChunkReceived: (chunkIndex: number, totalChunks: number) => void
): Promise<LocationExportData | null> {
  // Request data from the other device
  await writeCharacteristic(device, TRANSFER_CONTROL_CHAR_UUID, CMD_REQUEST_DATA);

  // Wait for and read the response
  // In a real implementation, this would use notifications/indications
  // For simplicity, we'll poll the characteristic
  const chunks: string[] = [];
  let totalChunks = 0;
  let receivedEnd = false;
  let attempts = 0;
  const maxAttempts = 100;

  while (!receivedEnd && attempts < maxAttempts) {
    attempts++;
    await sleep(100);

    try {
      // Read control characteristic for status
      const controlValue = await readCharacteristic(device, TRANSFER_CONTROL_CHAR_UUID);

      if (controlValue.startsWith(CMD_DATA_START)) {
        totalChunks = parseInt(controlValue.split(':')[1], 10);
      } else if (controlValue === CMD_DATA_END) {
        receivedEnd = true;
      }

      // Read data characteristic for chunks
      const dataValue = await readCharacteristic(device, LOCATION_DATA_CHAR_UUID);

      if (dataValue.startsWith(CMD_DATA_CHUNK)) {
        const parts = dataValue.split(':');
        const chunkIndex = parseInt(parts[1], 10);
        const chunkData = parts.slice(2).join(':');

        if (!chunks[chunkIndex]) {
          chunks[chunkIndex] = chunkData;
          onChunkReceived(chunks.filter(Boolean).length, totalChunks || chunks.length);
        }
      }
    } catch (e) {
      // Ignore read errors, keep trying
    }
  }

  if (chunks.length === 0) {
    return null;
  }

  // Reassemble the data
  const fullData = chunks.join('');

  try {
    return JSON.parse(fullData) as LocationExportData;
  } catch (e) {
    console.error('Failed to parse received location data:', e);
    return null;
  }
}

/**
 * Write a value to a characteristic
 */
async function writeCharacteristic(
  device: Device,
  characteristicUUID: string,
  value: string
): Promise<void> {
  const base64Value = Buffer.from(value, 'utf-8').toString('base64');

  await device.writeCharacteristicWithResponseForService(
    FOG_SERVICE_UUID,
    characteristicUUID,
    base64Value
  );
}

/**
 * Read a value from a characteristic
 */
async function readCharacteristic(
  device: Device,
  characteristicUUID: string
): Promise<string> {
  const characteristic = await device.readCharacteristicForService(
    FOG_SERVICE_UUID,
    characteristicUUID
  );

  if (!characteristic.value) {
    return '';
  }

  return Buffer.from(characteristic.value, 'base64').toString('utf-8');
}

/**
 * Split a string into chunks of specified size
 */
function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export constants for use in other modules
export {
  FOG_SERVICE_UUID,
  LOCATION_DATA_CHAR_UUID,
  TRANSFER_CONTROL_CHAR_UUID,
};
