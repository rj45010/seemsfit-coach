# SeemsFit Apple Watch — one-time Xcode setup

The watch app is hand-written SwiftUI (it can't reuse the Capacitor WebView). All the
Swift source is already in the repo; you create the two targets in Xcode and drag the
files in. `npx cap sync ios` does **not** touch these targets, so it's safe to keep running.

Source already in the repo:
- `ios/App/SeemsFit Watch/` — the watch app (glance, live workout).
- `ios/App/SeemsFit Watch Widget/StepsComplication.swift` — the Steps complication.
- `ios/App/App/WatchBridge.swift` — phone-side bridge (added to the existing **App** target).

---

## 1. Watch App target
1. Open `ios/App/App.xcworkspace` in Xcode.
2. **File ▸ New ▸ Target… ▸ watchOS ▸ App**. Interface **SwiftUI**, Language **Swift**.
   - Product name: **SeemsFit Watch**
   - Bundle id: **com.seemsfithealth.app.watchkitapp** (must be the phone id + `.watchkitapp`)
   - Uncheck "Include Notification Scene". Finish. (If asked to activate the scheme, yes.)
3. Xcode creates a starter folder. **Delete its generated `ContentView.swift` / `…App.swift`**
   (move to trash), then **drag in** every file from `ios/App/SeemsFit Watch/`
   (Add to target: *SeemsFit Watch*). There should be 12 Swift files.
4. Select the **SeemsFit Watch** target ▸ **Signing & Capabilities**:
   - Team: your free personal team.
   - **+ Capability ▸ HealthKit** (base only — do NOT tick "Estimate Recalibration").
5. **Info** tab ▸ add two keys (raw values fine):
   - `NSHealthShareUsageDescription` = "SeemsFit reads your steps, heart rate and energy to show today's recovery and track workouts."
   - `NSHealthUpdateUsageDescription` = "SeemsFit saves the workouts you record on your watch to Apple Health."
6. Deployment target: watchOS 10.0+ (the code uses WidgetKit accessory families + modern HealthKit async).

## 2. Steps complication (Widget Extension)
1. **File ▸ New ▸ Target… ▸ watchOS ▸ Widget Extension**.
   - Product name: **SeemsFit Watch Widget**
   - **Uncheck** "Include Configuration App Intent" and "Include Live Activity".
   - Embed in: **SeemsFit Watch**.
2. Delete the generated widget Swift file, then **drag in**
   `ios/App/SeemsFit Watch Widget/StepsComplication.swift` (target: *SeemsFit Watch Widget*).
3. Select the **SeemsFit Watch Widget** target ▸ **Signing & Capabilities** ▸ same team ▸
   **+ Capability ▸ HealthKit** (base only). Add the same two `NSHealth…UsageDescription`
   keys to its Info.
   - Note: the file declares `@main struct StepsComplication`. If Xcode's generated
     bundle also has an `@main`, keep only this one (delete the generated widget/bundle file).

## 3. Phone-side bridge (already in the App target)
`ios/App/App/WatchBridge.swift` is a Capacitor plugin; it auto-registers (subclasses
`CAPPlugin` + `CAPBridgedPlugin`). Just confirm it's a member of the **App** target
(File Inspector ▸ Target Membership ▸ App). No capability needed — WatchConnectivity is
implicit. The web side calls it via `src/lib/watchBridge.ts` (already wired into Today).

## 4. Build & run
- Pair the watch (or use a paired simulator: iPhone + Watch).
- Build the **App** scheme to the phone first (the watch app installs *through* it).
- Build the **SeemsFit Watch** scheme to the watch.
- First watch launch prompts for HealthKit on the watch (separate from the phone grant).

## What to expect
- **Glance**: today's steps read live on the watch immediately; the Recovery/Strain/Sleep
  rings show "—" until you open the phone app once (it pushes the scores over WatchConnectivity).
- **Workout**: tap *Start workout ▸ pick a type*. For Strength/Core you get a second page
  (swipe ‹): a full set logger — add exercise, add set, tap a set to dial weight/reps/RPE on
  the Digital Crown, link supersets; logging an RPE starts the rest timer. Tap **End**.
  The session saves to Apple Health AND the logged sets are sent to the phone; the next time
  you open the app they're written to Firestore as a `watch` workout (no phone needed during
  the session). The in-app **Add load** editor (WorkoutDetail) is still there for any session
  you'd rather fill in on the phone, or to tweak what the watch sent.
- **Complication**: edit a watch face ▸ add the **SeemsFit · Steps** complication.

## Free-tier reminders
- 7-day signing expiry applies to the watch app too; rebuild from Xcode to renew.
- The phone build must be valid at the same time (watch installs through the phone).
