# Fog of War Explorer

A mobile app for iOS and Android that tracks your visited locations and reveals them on a map with a fog of war effect. Unexplored areas are covered in darkness, and as you move around in real life, a 0.1 mile radius around your path is revealed.

## Features

- Real-time location tracking
- Persistent storage of visited locations using SQLite
- Fog of war overlay that reveals 0.1 mile radius around explored areas
- Background location tracking support
- Clear history functionality
- Works on both iOS and Android
- **Free map tiles** - uses OpenStreetMap via MapLibre (no API key required!)

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- For iOS: Xcode (macOS only)
- For Android: Android Studio with an emulator or a physical device

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Run on a device/emulator:
   - Press `i` for iOS simulator (macOS only)
   - Press `a` for Android emulator
   - Scan the QR code with Expo Go app on your physical device

**Note:** This app uses native modules (MapLibre, SQLite), so it requires a development build rather than Expo Go for full functionality.

## Building for Development

Since this app uses native modules, you need to create a development build:

```bash
# For iOS (macOS only)
npx expo run:ios

# For Android
npx expo run:android
```

## Building for Production

### EAS Build (for app store distribution):
```bash
npx eas build --platform ios
npx eas build --platform android
```

## Project Structure

```
├── App.tsx                 # Main app component
├── src/
│   ├── components/
│   │   ├── FogOfWarMap.tsx # Map with fog overlay (MapLibre + OpenStreetMap)
│   │   └── ControlPanel.tsx # UI controls
│   ├── hooks/
│   │   └── useLocationTracking.ts # Location tracking hook
│   ├── services/
│   │   └── database.ts     # SQLite database operations
│   └── types/
│       └── index.ts        # TypeScript type definitions
├── app.json               # Expo configuration
└── package.json           # Dependencies
```

## Permissions

The app requires the following permissions:

### iOS
- Location When In Use
- Location Always (for background tracking)

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE

## How It Works

1. When tracking starts, the app requests location permissions
2. As you move, your GPS coordinates are saved to a local SQLite database
3. The map displays all visited locations with a revealed radius of 0.1 miles
4. Unexplored areas are covered with a semi-transparent fog overlay
5. Location data persists between app sessions

## Map Tiles

This app uses **MapLibre** with **OpenStreetMap** tiles, which are completely free to use. No API key is required!

The map data is provided by OpenStreetMap contributors under the [ODbL license](https://www.openstreetmap.org/copyright).

## Configuration

You can adjust the reveal radius by modifying the `revealRadiusMiles` prop in `App.tsx`:

```tsx
<FogOfWarMap
  visitedLocations={visitedLocations}
  currentLocation={currentLocation}
  revealRadiusMiles={0.1} // Change this value
/>
```

## License

MIT
