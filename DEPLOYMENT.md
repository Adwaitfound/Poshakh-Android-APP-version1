# Deployment Summary — PWA & Android

Date: 2025-12-26

## PWA (Firebase Hosting)

- Project: `poshakh-stock`
- URL: https://poshakh-stock.web.app
- Build: Vite v5, output in `dist/`
- Commands:
  - `npm install`
  - `npm run build`
  - `npm run deploy`

## Android

- Synced web assets via Capacitor: `npx cap sync android`
- Outputs:
  - Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
  - Release APK (unsigned): `android/app/build/outputs/apk/release/app-release-unsigned.apk`
  - Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Build commands:
  - `./android/gradlew -p android assembleDebug`
  - `./android/gradlew -p android assembleRelease`
  - `./android/gradlew -p android bundleRelease`

### Signing (for Play Store)

Provide keystore details to configure `signingConfigs` in `android/app/build.gradle` or sign artifacts externally with `jarsigner`/`apksigner`.

# Poshakh Manager App – Deployment Guide

## Overview

This is a Capacitor + React + Vite SPA with role-based access (Adwait/Avani admins, Binay staff). Deployed on:

- **Android APK**: Debug builds via Gradle
- **Web**: Firebase Hosting at https://poshakh-stock.web.app

## Android Build & Install

### Prerequisites

- macOS with Android SDK installed
- Capacitor CLI: `npm install -g @capacitor/cli`
- Gradle in `android/` folder

### Steps

```bash
# Build web assets
npm run build

# Copy to Android
npx cap copy android

# Build APK
cd android && ./gradlew assembleDebug

# Install on device
adb -d install -r app/build/outputs/apk/debug/app-debug.apk
```

## Web Deployment

### Manual Deploy

```bash
npm run build
firebase deploy --only hosting
```

### Auto-Deploy (GitHub Actions)

Pushes to `main` or `release/**` branches auto-deploy to Firebase Hosting.

**Setup required:**

1. Generate Firebase service account key:
   ```bash
   firebase projects:list
   firebase init hosting  # if needed
   ```
2. Add to GitHub Secrets as `FIREBASE_SERVICE_ACCOUNT_POSHAKH_STOCK` (base64-encoded JSON)
3. Push to trigger CI/CD

### Preview Channels (Pull Requests)

- PR auto-deploys to a preview URL.
- Comment posted with preview link.
- Preview expires after 7 days.

**Manual preview deploy:**

```bash
firebase hosting:channel:deploy staging --expires 7d
# Returns: https://staging---poshakh-stock.web.app
```

## Caching Strategy

- **index.html, sw.js, manifest.webmanifest**: No cache (updated on every deploy)
- **Assets (versioned)**: 1 year immutable cache (safe because Vite hashes filenames)
- **Fonts & images**: 1 year immutable cache

This ensures users always get the latest code while static assets load from browser cache.

## Environment & Users

- **Admins**: Adwait, Avani (full access to all tabs; Financial Insights visible)
- **Staff**: Binay (Inventory tab only; forced on login)
- **Auth**: localStorage + Firestore (Firebase client SDK)

## Features

✅ Role-based UI restrictions  
✅ Error Boundary + per-tab guards (prevents white screen)  
✅ Null-safe auth handling  
✅ PWA support (Web App Manifest, Service Worker)  
✅ Status bar styling (Android)  
✅ Safe-area insets (notches, bottom nav)

## Troubleshooting

### App shows white screen

- Tap "Clear User & Reload" on error screen, or
- `localStorage.removeItem('poshakh-user')` in console

### Auth not persisting

- Check `localStorage` in browser/device console
- Verify Firebase Firestore credentials in `src/firebase.js`

### iOS/PWA not working

- Install via "Add to Home Screen" on iOS
- PWA icons: `public/*.png`

## Stable Releases

- **Branch**: `release/stable-2025-12-18`
- **Tag**: `stable-2025-12-18`
- Contains auth fixes, error boundaries, branding icons

Push to upstream:

```bash
git push origin release/stable-2025-12-18
git push origin stable-2025-12-18
```
