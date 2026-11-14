# AI Brief for Android

The AI Brief website packaged as a native Android app (Capacitor 6 + a small native layer for background alerts).

## What was added
- `capacitor.config.json`, `android/`: the Android Studio project (package `com.aibrief.app`).
- `src/components/NativeShell.tsx`: system back button, pull to refresh, haptics, status bar colours, in-app browser for outside links, notification deep links, and the contextual alerts opt-in sheet.
- `src/pages/AlertsPage.tsx` (`/alerts`): alert switches per content type, test alert, manual check, status, server address.
- `src/native/bridge.ts`: typed bridge to the native plugin.
- `src/styles/native.css`: mobile-only styling (scoped to `.native-app`, the website itself is unchanged).
- `android/app/src/main/java/com/aibrief/app/`
  - `ContentSyncWorker.java`: WorkManager job that polls `/articles`, `/videos`, `/tutorials` about every 15 minutes, even when the app is closed.
  - `ContentNotifier.java`: notification channels (one per content type) and the notifications themselves.
  - `ContentAlertsPlugin.java`: Capacitor plugin used by the Alerts screen.
- Fonts are bundled (Inter, Playfair Display, DM Sans) so the app looks right offline.

## How alerts work
1. The first check stores what already exists (no flood of old items).
2. Later checks compare the newest 20 items per type against what was seen and notify for anything new.
3. Tapping a notification opens that article, video or tutorial (`aibrief://open/<route>`).
4. Alerts need a reachable AI Brief API. Set it in the app (More > Alerts > Connection) or at build time with `VITE_API_BASE_URL` in `.env.local`. With no server the app shows the built-in demo content and only test alerts can be sent.
5. Polling is limited by Android to a 15 minute minimum. For instant push, add Firebase Cloud Messaging on the backend and reuse `ContentNotifier`.

## Build
```
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
```
Or open the `android` folder in Android Studio (JDK 17, Android SDK 34). For Google Play, create a keystore and build a signed release (`./gradlew bundleRelease`).

## HCI principles applied
- Visibility of system status: pull-to-refresh spinner, toasts for every setting change, last-check status, clear on/off labels.
- Match with platform conventions: labelled bottom navigation, system back button, Android notification channels, system permission flow.
- User control and freedom: alerts are opt-in, dismissible, adjustable per content type, and reversible at any time.
- Error prevention and recovery: server address validation with plain-language help, blocked-permission banner with a direct route to settings.
- Recognition over recall: icons always paired with text labels; current tab is highlighted with colour, weight and a pill (never colour alone).
- Fitts's law and the thumb zone: primary navigation at the bottom, touch targets of 48dp or more.
- Accessibility: switch roles and labels for screen readers, visible focus rings, reduced-motion support, light and dark themes.
- Permission timing: the notification request appears in context after the first screen, with the benefit explained, never on cold launch.
