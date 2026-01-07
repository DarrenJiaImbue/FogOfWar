import * as SQLite from 'expo-sqlite';
import circle from '@turf/circle';
import union from '@turf/union';
import difference from '@turf/difference';
import { RevealedGeometry, RevealedAreaStats, LocationSource, ExportableLocation, LocationExportData } from '../types';

const DATABASE_NAME = 'fog_of_war.db';
const REVEAL_RADIUS_MILES = 0.1;

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // Create tables if they don't exist
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS revealed_geometry (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      geojson TEXT NOT NULL,
      location_count INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS location_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'self'
    );

    CREATE TABLE IF NOT EXISTS shared_geometry (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      geojson TEXT NOT NULL,
      location_count INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );
  `);

  // Migration: Add source column to existing location_history if it doesn't exist
  try {
    await db.execAsync(`
      ALTER TABLE location_history ADD COLUMN source TEXT NOT NULL DEFAULT 'self';
    `);
  } catch (e) {
    // Column already exists, ignore error
  }
}

export function isDatabaseReady(): boolean {
  return db !== null;
}

/**
 * Creates a circle polygon for a given location
 */
function createRevealCircle(latitude: number, longitude: number): GeoJSON.Feature<GeoJSON.Polygon> {
  return circle([longitude, latitude], REVEAL_RADIUS_MILES, {
    steps: 32,
    units: 'miles',
  });
}

/**
 * Adds a new visited location and merges it with existing revealed geometry.
 * Returns true if the geometry was updated, false if this location was already revealed.
 */
export async function addVisitedLocation(
  latitude: number,
  longitude: number
): Promise<boolean> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const timestamp = Date.now();
  const newCircle = createRevealCircle(latitude, longitude);

  // Get existing geometry
  const existing = await db.getFirstAsync<{ geojson: string; location_count: number }>(
    'SELECT geojson, location_count FROM revealed_geometry WHERE id = 1'
  );

  let mergedGeometry: RevealedGeometry;
  let newLocationCount: number;

  if (existing) {
    const existingGeometry = JSON.parse(existing.geojson) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

    // Union the new circle with existing geometry
    // turf/union v7+ requires a FeatureCollection with at least 2 features
    const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: 'FeatureCollection',
      features: [existingGeometry, newCircle],
    };
    const unionResult = union(fc);
    mergedGeometry = unionResult;
    newLocationCount = existing.location_count + 1;
  } else {
    // First location - just use the circle
    mergedGeometry = newCircle;
    newLocationCount = 1;
  }

  // Save merged geometry
  const geojsonStr = JSON.stringify(mergedGeometry);

  await db.runAsync(
    `INSERT INTO revealed_geometry (id, geojson, location_count, last_updated)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       geojson = excluded.geojson,
       location_count = excluded.location_count,
       last_updated = excluded.last_updated`,
    [geojsonStr, newLocationCount, timestamp]
  );

  // Also log to history for analytics (optional, lightweight)
  await db.runAsync(
    'INSERT INTO location_history (latitude, longitude, timestamp) VALUES (?, ?, ?)',
    [latitude, longitude, timestamp]
  );

  return true;
}

/**
 * Gets the current revealed geometry for rendering
 */
export async function getRevealedGeometry(): Promise<RevealedGeometry> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const row = await db.getFirstAsync<{ geojson: string }>(
    'SELECT geojson FROM revealed_geometry WHERE id = 1'
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.geojson) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

/**
 * Gets stats about revealed areas
 */
export async function getRevealedStats(): Promise<RevealedAreaStats> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const row = await db.getFirstAsync<{ location_count: number; last_updated: number }>(
    'SELECT location_count, last_updated FROM revealed_geometry WHERE id = 1'
  );

  return {
    locationCount: row?.location_count ?? 0,
    lastUpdated: row?.last_updated ?? 0,
  };
}

/**
 * Clears all revealed geometry and history
 */
export async function clearAllLocations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  await db.runAsync('DELETE FROM revealed_geometry');
  await db.runAsync('DELETE FROM shared_geometry');
  await db.runAsync('DELETE FROM location_history');
}

/**
 * Gets the shared geometry (locations received from others)
 */
export async function getSharedGeometry(): Promise<RevealedGeometry> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const row = await db.getFirstAsync<{ geojson: string }>(
    'SELECT geojson FROM shared_geometry WHERE id = 1'
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.geojson) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

/**
 * Computes the "shared only" geometry - areas that are shared but not personally visited.
 * This is used to render the 50% opacity fog layer.
 */
export async function getSharedOnlyGeometry(): Promise<RevealedGeometry> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const personal = await getRevealedGeometry();
  const shared = await getSharedGeometry();

  if (!shared) {
    return null;
  }

  if (!personal) {
    return shared;
  }

  // Compute shared - personal (areas shared but not personally visited)
  const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: 'FeatureCollection',
    features: [shared, personal],
  };

  const diffResult = difference(fc);
  return diffResult;
}

/**
 * Adds a shared location received from another user
 */
export async function addSharedLocation(
  latitude: number,
  longitude: number,
  originalTimestamp: number
): Promise<boolean> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const timestamp = Date.now();
  const newCircle = createRevealCircle(latitude, longitude);

  // Get existing shared geometry
  const existing = await db.getFirstAsync<{ geojson: string; location_count: number }>(
    'SELECT geojson, location_count FROM shared_geometry WHERE id = 1'
  );

  let mergedGeometry: RevealedGeometry;
  let newLocationCount: number;

  if (existing) {
    const existingGeometry = JSON.parse(existing.geojson) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

    const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: 'FeatureCollection',
      features: [existingGeometry, newCircle],
    };
    const unionResult = union(fc);
    mergedGeometry = unionResult;
    newLocationCount = existing.location_count + 1;
  } else {
    mergedGeometry = newCircle;
    newLocationCount = 1;
  }

  const geojsonStr = JSON.stringify(mergedGeometry);

  await db.runAsync(
    `INSERT INTO shared_geometry (id, geojson, location_count, last_updated)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       geojson = excluded.geojson,
       location_count = excluded.location_count,
       last_updated = excluded.last_updated`,
    [geojsonStr, newLocationCount, timestamp]
  );

  // Also log to history with 'shared' source
  await db.runAsync(
    'INSERT INTO location_history (latitude, longitude, timestamp, source) VALUES (?, ?, ?, ?)',
    [latitude, longitude, originalTimestamp, 'shared']
  );

  return true;
}

/**
 * Bulk import shared locations from another user
 */
export async function importSharedLocations(locations: ExportableLocation[]): Promise<number> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  let importedCount = 0;

  for (const loc of locations) {
    // Check if this exact location already exists (avoid duplicates)
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM location_history WHERE latitude = ? AND longitude = ? AND timestamp = ?',
      [loc.lat, loc.lon, loc.ts]
    );

    if (!existing) {
      await addSharedLocation(loc.lat, loc.lon, loc.ts);
      importedCount++;
    }
  }

  return importedCount;
}

/**
 * Export all personal locations for sharing via Bluetooth
 */
export async function exportLocationHistory(): Promise<LocationExportData> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const rows = await db.getAllAsync<{ latitude: number; longitude: number; timestamp: number }>(
    "SELECT latitude, longitude, timestamp FROM location_history WHERE source = 'self' ORDER BY timestamp ASC"
  );

  const locations: ExportableLocation[] = rows.map(row => ({
    lat: row.latitude,
    lon: row.longitude,
    ts: row.timestamp,
  }));

  return {
    version: 1,
    locations,
  };
}

/**
 * Get stats about shared areas
 */
export async function getSharedStats(): Promise<RevealedAreaStats> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const row = await db.getFirstAsync<{ location_count: number; last_updated: number }>(
    'SELECT location_count, last_updated FROM shared_geometry WHERE id = 1'
  );

  return {
    locationCount: row?.location_count ?? 0,
    lastUpdated: row?.last_updated ?? 0,
  };
}

/**
 * Gets the combined geometry of personal + shared locations (for fog cutout)
 */
export async function getAllRevealedGeometry(): Promise<RevealedGeometry> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const personal = await getRevealedGeometry();
  const shared = await getSharedGeometry();

  if (!personal && !shared) {
    return null;
  }

  if (!personal) {
    return shared;
  }

  if (!shared) {
    return personal;
  }

  // Union both geometries
  const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: 'FeatureCollection',
    features: [personal, shared],
  };

  return union(fc);
}

/**
 * Gets the count of logged locations (for display)
 */
export async function getLocationCount(): Promise<number> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT location_count as count FROM revealed_geometry WHERE id = 1'
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

/**
 * Check if a new location is far enough from the last recorded location
 * to be worth merging (avoids redundant union operations)
 */
let lastRecordedLocation: { lat: number; lon: number } | null = null;

export function isLocationSignificant(
  latitude: number,
  longitude: number,
  minDistanceMiles: number = 0.02 // ~100 feet
): boolean {
  if (!lastRecordedLocation) {
    return true;
  }

  const distance = calculateDistanceMiles(
    latitude,
    longitude,
    lastRecordedLocation.lat,
    lastRecordedLocation.lon
  );

  return distance >= minDistanceMiles;
}

export function updateLastRecordedLocation(latitude: number, longitude: number): void {
  lastRecordedLocation = { lat: latitude, lon: longitude };
}
