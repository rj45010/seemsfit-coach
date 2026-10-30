# Rest-timer Live Activity (Dynamic Island + Lock Screen) — Xcode setup

All code is in the repo. You add ONE Widget Extension target and a single Info.plist key.
`npx cap sync ios` leaves these alone.

Files already on disk:
- `ios/App/App/RestActivityAttributes.swift` — shared model (App target **and** the new widget target).
- `ios/App/App/RestTimerBridge.swift` — Capacitor plugin in the **App** target (auto-registers).
- `ios/App/SeemsFit Rest Widget/RestLiveActivity.swift` — the widget UI (`@main` bundle).
- Web side: `src/lib/restLiveActivity.ts` + wiring in `src/lib/restTimer.ts` (already done).

## 1. App target — enable Live Activities
- Select the **App** target ▸ **Info** tab ▸ add key `NSSupportsLiveActivities` (Boolean) = **YES**.
- Confirm `RestActivityAttributes.swift` and `RestTimerBridge.swift` are members of the **App** target (File Inspector ▸ Target Membership ▸ App).

## 2. New Widget Extension target
- **File ▸ New ▸ Target… ▸ iOS ▸ Widget Extension**.
  - Product name: **SeemsFit Rest Widget**
  - **Check "Include Live Activity"**, uncheck "Include Configuration App Intent".
  - Embed in: the **App** target. Your signing team.
- Delete the generated widget/bundle Swift files (the repo's `RestLiveActivity.swift` already has `@main`).
- Add `ios/App/SeemsFit Rest Widget/RestLiveActivity.swift` to this target.
- Also tick **RestActivityAttributes.swift**'s Target Membership so it belongs to BOTH App and the widget.
- Deployment target iOS 16.2+ (ActivityKit `ActivityContent`).

## 3. Build & test
- Build the App scheme to the phone.
- In the app, log a set so RPE starts the 2:00 rest timer → a Live Activity appears on the
  Lock Screen and in the Dynamic Island (iPhone 14 Pro+); on older phones it shows on the
  Lock Screen / banner only. The ± rest buttons update it; it auto-dismisses at zero.

## Notes
- Free personal team is fine. Live Activities need the user to allow them (Settings ▸ app),
  on by default. If `areActivitiesEnabled` is false the bridge silently no-ops.
- No push server needed — the countdown ticks locally via `Text(timerInterval:)`.
