# iOS native setup (one-time, needs the Apple Developer account)

The Capacitor iOS shell, HealthKit sync, and native Google Sign-In are wired in
code. These steps can only be done in Xcode / the Firebase console with the
your Firebase project + a developer signing team. Until they're done the native
build won't run (Firebase configure crashes without the plist).

Bundle ID is **`com.seemsfithealth.app`** everywhere (capacitor.config.ts +
Xcode), matching the iOS app registered in Firebase (App ID
`1:927157736063:ios:c4b31f56a4948b2a18e54a`).

## 1. Firebase (Google Sign-In)
Already done in code: `GoogleService-Info.plist` is at `ios/App/App/`, the
`REVERSED_CLIENT_ID` is in `Info.plist`, and `FirebaseApp.configure()` is in
`AppDelegate.swift`. Remaining Xcode steps:
1. **Add the plist to the App target** — in Xcode, right-click the `App` group →
   *Add Files to "App"…* → select `GoogleService-Info.plist` → ensure the **App**
   target is checked. (Placing the file on disk isn't enough; it must be in
   "Copy Bundle Resources" or `FirebaseApp.configure()` crashes at launch.)
2. **Add the Firebase SDK** to the App target via SPM:
   Xcode → File → Add Package Dependencies →
   `https://github.com/firebase/firebase-ios-sdk` → add **FirebaseAuth**
   (this makes `import FirebaseCore` in `AppDelegate.swift` resolve).
3. Firebase console → Authentication → Sign-in method → ensure **Google** is
   enabled (it already is for web).

## 2. HealthKit
1. Xcode → target **App** → Signing & Capabilities → **+ Capability →
   HealthKit**. This links `App.entitlements` and the HealthKit framework.
2. Select a **Team** (the $99 developer account) — HealthKit needs a paid App ID.
   - Usage strings are already in `Info.plist` (`NSHealthShareUsageDescription`).

## 3. Run
```
cd apps/web && npm run ios     # build web → sync → open Xcode
```
Pick your device + team, Run. On first launch it asks for Health permissions;
today's steps/strain/recovery then populate automatically.

## What works without any of this
The **web** build is unaffected — Google popup sign-in and the yesterday-fallback
for steps/strain work exactly as before. All native paths are `isNativePlatform()`
gated.
