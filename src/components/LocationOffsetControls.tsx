import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { LocationPoint } from '../types';

interface LocationOffsetControlsProps {
  locationOffset: LocationPoint;
  onAdjust: (direction: 'north' | 'south' | 'east' | 'west', meters: number) => void;
  onReset: () => void;
  stepMeters?: number;
}

export function LocationOffsetControls({
  locationOffset,
  onAdjust,
  onReset,
  stepMeters = 10,
}: LocationOffsetControlsProps) {
  // Calculate approximate offset in meters for display
  const offsetMetersLat = Math.round(locationOffset.latitude * 111320);
  const offsetMetersLng = Math.round(locationOffset.longitude * 111320);

  const hasOffset = locationOffset.latitude !== 0 || locationOffset.longitude !== 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Offset (Testing)</Text>

      <View style={styles.controlsContainer}>
        {/* North button */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.directionButton}
            onPress={() => onAdjust('north', stepMeters)}
          >
            <Text style={styles.buttonText}>N</Text>
            <Text style={styles.arrowText}>^</Text>
          </TouchableOpacity>
        </View>

        {/* West, Reset, East buttons */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.directionButton}
            onPress={() => onAdjust('west', stepMeters)}
          >
            <Text style={styles.arrowText}>{'<'}</Text>
            <Text style={styles.buttonText}>W</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.resetButton, !hasOffset && styles.resetButtonDisabled]}
            onPress={onReset}
            disabled={!hasOffset}
          >
            <Text style={[styles.resetText, !hasOffset && styles.resetTextDisabled]}>
              Reset
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.directionButton}
            onPress={() => onAdjust('east', stepMeters)}
          >
            <Text style={styles.buttonText}>E</Text>
            <Text style={styles.arrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        {/* South button */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.directionButton}
            onPress={() => onAdjust('south', stepMeters)}
          >
            <Text style={styles.arrowText}>v</Text>
            <Text style={styles.buttonText}>S</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.offsetText}>
        Offset: {offsetMetersLat}m N/S, {offsetMetersLng}m E/W
      </Text>
      <Text style={styles.stepText}>Step: {stepMeters}m per tap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  controlsContainer: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionButton: {
    width: 44,
    height: 44,
    backgroundColor: '#4285F4',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  arrowText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '400',
  },
  resetButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FF9800',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  resetButtonDisabled: {
    backgroundColor: '#ccc',
  },
  resetText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  resetTextDisabled: {
    color: '#999',
  },
  offsetText: {
    fontSize: 10,
    color: '#666',
    marginTop: 8,
  },
  stepText: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
});
