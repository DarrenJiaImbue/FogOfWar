import * as SQLite from 'expo-sqlite';
import { VisitedLocation } from '../types';

const DATABASE_NAME = 'fog_of_war.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS visited_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      accuracy REAL
    );

    CREATE INDEX IF NOT EXISTS idx_lat_lon ON visited_locations (latitude, longitude);
  `);
}

export async function addVisitedLocation(
  latitude: number,
  longitude: number,
  accuracy: number | null
): Promise<number> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const timestamp = Date.now();

  const result = await db.runAsync(
    'INSERT INTO visited_locations (latitude, longitude, timestamp, accuracy) VALUES (?, ?, ?, ?)',
    [latitude, longitude, timestamp, accuracy]
  );

  return result.lastInsertRowId;
}

export async function getAllVisitedLocations(): Promise<VisitedLocation[]> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const rows = await db.getAllAsync<VisitedLocation>(
    'SELECT id, latitude, longitude, timestamp, accuracy FROM visited_locations ORDER BY timestamp DESC'
  );

  return rows;
}

export async function getVisitedLocationsInBounds(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number
): Promise<VisitedLocation[]> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const rows = await db.getAllAsync<VisitedLocation>(
    `SELECT id, latitude, longitude, timestamp, accuracy
     FROM visited_locations
     WHERE latitude BETWEEN ? AND ?
     AND longitude BETWEEN ? AND ?`,
    [minLat, maxLat, minLon, maxLon]
  );

  return rows;
}

export async function clearAllLocations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  await db.runAsync('DELETE FROM visited_locations');
}

export async function getLocationCount(): Promise<number> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM visited_locations'
  );

  return result?.count ?? 0;
}

// Calculate distance between two points in miles using Haversine formula
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Check if a new location is far enough from existing ones to be worth saving
// This helps reduce database clutter by only saving locations that are at least
// a minimum distance from any existing saved location
export async function isLocationSignificant(
  latitude: number,
  longitude: number,
  minDistanceMiles: number = 0.02 // ~100 feet by default
): Promise<boolean> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Get nearby locations within a rough bounding box
  const latDelta = minDistanceMiles / 69; // Rough conversion: 1 degree lat = ~69 miles
  const lonDelta = minDistanceMiles / (69 * Math.cos(toRadians(latitude)));

  const nearbyLocations = await getVisitedLocationsInBounds(
    latitude - latDelta,
    latitude + latDelta,
    longitude - lonDelta,
    longitude + lonDelta
  );

  // Check if any nearby location is within the minimum distance
  for (const loc of nearbyLocations) {
    const distance = calculateDistanceMiles(latitude, longitude, loc.latitude, loc.longitude);
    if (distance < minDistanceMiles) {
      return false;
    }
  }

  return true;
}
