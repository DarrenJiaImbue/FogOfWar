import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {
  DiscoveredDevice,
  BluetoothState,
  TransferProgress,
} from '../types';

interface SharePanelProps {
  visible: boolean;
  onClose: () => void;
  bluetoothState: BluetoothState;
  isScanning: boolean;
  discoveredDevices: DiscoveredDevice[];
  transferProgress: TransferProgress;
  onStartScanning: () => void;
  onStopScanning: () => void;
  onDeviceSelect: (deviceId: string) => void;
  onReset: () => void;
}

export function SharePanel({
  visible,
  onClose,
  bluetoothState,
  isScanning,
  discoveredDevices,
  transferProgress,
  onStartScanning,
  onStopScanning,
  onDeviceSelect,
  onReset,
}: SharePanelProps) {
  const renderBluetoothStatus = () => {
    switch (bluetoothState) {
      case 'poweredOff':
        return (
          <View style={styles.statusContainer}>
            <Text style={styles.statusIcon}>📵</Text>
            <Text style={styles.statusText}>Bluetooth is turned off</Text>
            <Text style={styles.statusHint}>Please enable Bluetooth in your device settings</Text>
          </View>
        );
      case 'unauthorized':
        return (
          <View style={styles.statusContainer}>
            <Text style={styles.statusIcon}>🚫</Text>
            <Text style={styles.statusText}>Bluetooth permission denied</Text>
            <Text style={styles.statusHint}>Please grant Bluetooth permission in settings</Text>
          </View>
        );
      case 'unsupported':
        return (
          <View style={styles.statusContainer}>
            <Text style={styles.statusIcon}>❌</Text>
            <Text style={styles.statusText}>Bluetooth not supported</Text>
            <Text style={styles.statusHint}>This device does not support Bluetooth</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderTransferProgress = () => {
    const { state, currentChunk, totalChunks, errorMessage } = transferProgress;

    if (state === 'idle') return null;

    let statusText = '';
    let showSpinner = false;

    switch (state) {
      case 'scanning':
        statusText = 'Searching for nearby users...';
        showSpinner = true;
        break;
      case 'connecting':
        statusText = 'Connecting...';
        showSpinner = true;
        break;
      case 'transferring':
        statusText = `Transferring... ${currentChunk}/${totalChunks}`;
        showSpinner = true;
        break;
      case 'completed':
        statusText = 'Transfer complete!';
        break;
      case 'error':
        statusText = `Error: ${errorMessage}`;
        break;
    }

    return (
      <View style={styles.progressContainer}>
        {showSpinner && <ActivityIndicator size="small" color="#4CAF50" />}
        <Text style={[
          styles.progressText,
          state === 'error' && styles.errorText,
          state === 'completed' && styles.successText,
        ]}>
          {statusText}
        </Text>
        {(state === 'completed' || state === 'error') && (
          <TouchableOpacity style={styles.resetButton} onPress={onReset}>
            <Text style={styles.resetButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderDevice = ({ item }: { item: DiscoveredDevice }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => onDeviceSelect(item.id)}
      disabled={transferProgress.state !== 'idle' && transferProgress.state !== 'scanning'}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
        {item.rssi && (
          <Text style={styles.deviceSignal}>
            Signal: {getSignalStrength(item.rssi)}
          </Text>
        )}
      </View>
      <Text style={styles.deviceArrow}>→</Text>
    </TouchableOpacity>
  );

  const canScan = bluetoothState === 'poweredOn' &&
    (transferProgress.state === 'idle' || transferProgress.state === 'scanning');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Share Locations</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Find nearby Fog of War users to share your explored locations.
            Both users will receive each other's location history.
          </Text>

          {renderBluetoothStatus()}
          {renderTransferProgress()}

          {bluetoothState === 'poweredOn' && (
            <>
              <View style={styles.scanSection}>
                {!isScanning ? (
                  <TouchableOpacity
                    style={[styles.scanButton, !canScan && styles.scanButtonDisabled]}
                    onPress={onStartScanning}
                    disabled={!canScan}
                  >
                    <Text style={styles.scanButtonText}>
                      {discoveredDevices.length > 0 ? 'Scan Again' : 'Start Scanning'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.scanButton, styles.scanButtonStop]}
                    onPress={onStopScanning}
                  >
                    <Text style={styles.scanButtonText}>Stop Scanning</Text>
                  </TouchableOpacity>
                )}
              </View>

              {discoveredDevices.length > 0 && (
                <View style={styles.deviceList}>
                  <Text style={styles.deviceListTitle}>
                    Nearby Users ({discoveredDevices.length})
                  </Text>
                  <FlatList
                    data={discoveredDevices}
                    renderItem={renderDevice}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                  />
                </View>
              )}

              {isScanning && discoveredDevices.length === 0 && (
                <View style={styles.searchingContainer}>
                  <ActivityIndicator size="large" color="#4CAF50" />
                  <Text style={styles.searchingText}>
                    Looking for nearby users...
                  </Text>
                  <Text style={styles.searchingHint}>
                    Make sure the other user has the app open
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getSignalStrength(rssi: number): string {
  if (rssi >= -50) return 'Excellent';
  if (rssi >= -60) return 'Good';
  if (rssi >= -70) return 'Fair';
  return 'Weak';
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  statusContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  statusHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f0f8f0',
    borderRadius: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  progressText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
  },
  errorText: {
    color: '#f44336',
  },
  successText: {
    color: '#4CAF50',
  },
  resetButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scanSection: {
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanButtonStop: {
    backgroundColor: '#f44336',
  },
  scanButtonDisabled: {
    backgroundColor: '#ccc',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    flex: 1,
    minHeight: 150,
  },
  deviceListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deviceSignal: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deviceArrow: {
    fontSize: 20,
    color: '#4CAF50',
  },
  searchingContainer: {
    alignItems: 'center',
    padding: 30,
  },
  searchingText: {
    fontSize: 16,
    color: '#333',
    marginTop: 16,
  },
  searchingHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});
