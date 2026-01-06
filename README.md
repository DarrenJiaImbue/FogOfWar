# Fog of War Explorer

A mobile app for iOS and Android that tracks your visited locations and reveals them on a map with a fog of war effect. Unexplored areas are covered in darkness, and as you move around in real life, a 0.1 mile radius around your path is revealed.

## Features

- Real-time location tracking
- Persistent storage of visited locations using SQLite
- Fog of war overlay that reveals 0.1 mile radius around explored areas
- Background location tracking support
- Clear history functionality
- Works on both iOS and Android

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- For iOS: Xcode (macOS only)
- For Android: Android Studio with an emulator or a physical device
- Google Maps API key (for production builds)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure Google Maps API key (required for Android, optional for iOS):
   - Get an API key from [Google Cloud Console](https://console.cloud.google.com/)
   - Enable "Maps SDK for Android" and "Maps SDK for iOS"
   - Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` in `app.json` with your actual API key

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on a device/emulator:
   - Press `i` for iOS simulator (macOS only)
   - Press `a` for Android emulator
   - Scan the QR code with Expo Go app on your physical device

## Building for Production

### Development build (recommended for testing):
```bash
npx expo run:ios
# or
npx expo run:android
```

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
│   │   ├── FogOfWarMap.tsx # Map with fog overlay
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
