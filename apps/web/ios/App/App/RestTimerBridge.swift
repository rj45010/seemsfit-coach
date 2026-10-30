import Foundation
import Capacitor
import ActivityKit

/// Capacitor plugin that drives the rest-timer Live Activity from the web app's rest
/// timer. start → request an Activity; update → push a new end time; end → dismiss.
///
/// JS usage (src/lib/restLiveActivity.ts):
///   RestTimerBridge.startRest({ endsAt })  // endsAt = epoch ms
@objc(RestTimerBridge)
public class RestTimerBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerBridge"
    public let jsName = "RestTimerBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRest", returnType: CAPPluginReturnPromise),
    ]

    private func endsDate(_ call: CAPPluginCall) -> Date? {
        guard let ms = call.getDouble("endsAt") else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    @objc func startRest(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(); return }
        guard let ends = endsDate(call) else { call.reject("missing endsAt"); return }

        // Replace any existing rest activity so we never stack two.
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            let state = RestActivityAttributes.ContentState(endsAt: ends)
            let content = ActivityContent(state: state, staleDate: ends)
            do {
                _ = try Activity.request(attributes: RestActivityAttributes(), content: content, pushType: nil)
                call.resolve()
            } catch {
                call.reject("activity_failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func updateRest(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let ends = endsDate(call) else { call.resolve(); return }
        Task {
            let state = RestActivityAttributes.ContentState(endsAt: ends)
            let content = ActivityContent(state: state, staleDate: ends)
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.update(content)
            }
            call.resolve()
        }
    }

    @objc func endRest(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    /// Current end time (epoch ms) of the running rest activity, or 0 if none. The web
    /// timer reads this on resume to pick up ±15s adjustments made from the Lock Screen.
    @objc func getRest(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["endsAt": 0]); return }
        let ms = Activity<RestActivityAttributes>.activities.first
            .map { $0.content.state.endsAt.timeIntervalSince1970 * 1000 } ?? 0
        call.resolve(["endsAt": ms])
    }
}
