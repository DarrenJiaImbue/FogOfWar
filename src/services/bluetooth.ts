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
    bleManager = new BleManager();
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
  if (Platform.OS === 'ios') {
    // iOS permissions are handled through Info.plist
    return true;
  }

  if (Platform.OS === 'android') {
    const apiLevel = Platform.Version;

    if (apiLevel >= 31) {
      // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
      );
    } else {
      // Android < 12 just needs location permission for BLE scanning
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === 'granted';
    }
  }

  return false;
}

/**
 * Check current Bluetooth state
 */
export async function getBluetoothState(): Promise<BluetoothState> {
  const manager = getBleManager();
  const state = await manager.state();
  return mapBleState(state);
}

/**
 * Subscribe to Bluetooth state changes
 */
export function onBluetoothStateChange(
  callback: (state: BluetoothState) => void
): () => void {
  const manager = getBleManager();
  const subscription = manager.onStateChange((state) => {
    callback(mapBleState(state));
  }, true);

  return () => subscription.remove();
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

  manager.startDeviceScan(
    [FOG_SERVICE_UUID],
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        onError(error);
        return;
      }

      if (device && !discoveredIds.has(device.id)) {
        discoveredIds.add(device.id);
        onDeviceFound({
          id: device.id,
          name: device.name || device.localName || 'Fog of War User',
          rssi: device.rssi,
        });
      }
    }
  );

  return () => {
    manager.stopDeviceScan();
  };
}

/**
 * Stop scanning for devices
 */
export function stopScanning(): void {
  const manager = getBleManager();
  manager.stopDeviceScan();
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
