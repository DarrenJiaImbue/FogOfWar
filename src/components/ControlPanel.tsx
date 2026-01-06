import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';

interface ControlPanelProps {
  isTracking: boolean;
  locationCount: number;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onClearHistory: () => void;
  errorMessage: string | null;
}

export function ControlPanel({
  isTracking,
  locationCount,
  onStartTracking,
  onStopTracking,
  onClearHistory,
  errorMessage,
}: ControlPanelProps) {
  const handleClearPress = () => {
    Alert.alert(
      'Clear Location History',
      'Are you sure you want to clear all visited locations? This will reset your fog of war map.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: onClearHistory,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, isTracking ? styles.statusActive : styles.statusInactive]} />
        <Text style={styles.statusText}>
          {isTracking ? 'Tracking Active' : 'Tracking Paused'}
        </Text>
      </View>

      <Text style={styles.locationCount}>
        {locationCount} location{locationCount !== 1 ? 's' : ''} explored
      </Text>

      {errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.button,
            isTracking ? styles.buttonStop : styles.buttonStart,
          ]}
          onPress={isTracking ? onStopTracking : onStartTracking}
        >
          <Text style={styles.buttonText}>
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonClear]}
          onPress={handleClearPress}
        >
          <Text style={styles.buttonText}>Clear History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusActive: {
    backgroundColor: '#4CAF50',
  },
  statusInactive: {
    backgroundColor: '#9E9E9E',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  locationCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#4CAF50',
  },
  buttonStop: {
    backgroundColor: '#FF9800',
  },
  buttonClear: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
