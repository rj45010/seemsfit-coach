import Foundation
import Capacitor
import WatchConnectivity

/// Phone-side Capacitor plugin: the JS bridge for WatchConnectivity. The actual WCSession
/// delegate lives natively in `WatchSession` (always alive, even when suspended); this plugin
/// just forwards JS calls to it and relays incoming-workout pings back to the web layer.
///
/// JS usage (see src/lib/watchBridge.ts).
@objc(WatchBridge)
public class WatchBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridge"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pushContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushPlans", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainPendingWorkouts", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        // Relay a queued watch workout to JS (WatchSession posts this when one arrives).
        NotificationCenter.default.addObserver(self, selector: #selector(onWatchWorkout),
                                               name: .watchWorkoutReceived, object: nil)
    }

    @objc private func onWatchWorkout() { notifyListeners("watchWorkout", data: [:]) }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let ok = WCSession.isSupported() && WCSession.default.isPaired && WCSession.default.isWatchAppInstalled
        call.resolve(["available": ok])
    }

    @objc func pushContext(_ call: CAPPluginCall) {
        var ctx: [String: Any] = [:]
        if let r = call.getInt("recovery") { ctx["recovery"] = r }
        if let s = call.getDouble("strain") { ctx["strain"] = s }
        if let m = call.getInt("sleepMin") { ctx["sleepMin"] = m }
        if let st = call.getInt("steps") { ctx["steps"] = st }
        // Calorie-model inputs (Keytel) for the watch's live sessions.
        if let w = call.getDouble("weightKg") {
            var prof: [String: Any] = ["weightKg": w]
            if let a = call.getInt("ageYears") { prof["ageYears"] = a }
            if let sx = call.getString("sex") { prof["sex"] = sx }
            ctx["calorieProfile"] = prof
        }
        call.resolve(["ok": WatchSession.shared.pushMerged(ctx)])
    }

    /// Push the user's workout plans (a JSON STRING — always plist-legal; a parsed object can
    /// contain NSNull, which updateApplicationContext rejects).
    @objc func pushPlans(_ call: CAPPluginCall) {
        guard let json = call.getString("plansJson") else {
            call.resolve(["ok": false, "reason": "decode"]); return
        }
        call.resolve(["ok": WatchSession.shared.pushMerged(["plans": json])])
    }

    /// Vend the watch a fresh Firebase ID token (+ ids); WatchSession stores the ids so it can
    /// mint fresh tokens on its own later, even with the app closed.
    @objc func setAuth(_ call: CAPPluginCall) {
        guard let t = call.getString("token"), let u = call.getString("uid"),
              let p = call.getString("projectId"), let j = call.getString("jarvisUrl") else {
            call.resolve(["ok": false, "reason": "missing"]); return
        }
        call.resolve(["ok": WatchSession.shared.setAuth(token: t, uid: u, projectId: p, jarvisUrl: j)])
    }

    /// Return every workout the watch has sent since the last drain, then clear the queue.
    @objc func drainPendingWorkouts(_ call: CAPPluginCall) {
        call.resolve(["workouts": WatchSession.shared.drainPending()])
    }
}
