import Foundation
import WatchConnectivity
import FirebaseAuth
import UIKit

/// Native, always-alive WatchConnectivity delegate. It's set up in AppDelegate (not the
/// Capacitor plugin), so it stays active even when the app is suspended: the watch can
/// `sendMessage(["req":"token"])` and iOS wakes this handler in the background to mint a FRESH
/// Firebase ID token and reply — fixing "couldn't reach Vyom" when the phone's in a pocket.
///
/// It also owns the app-context push (snapshot/plans/auth) and the incoming-workout queue; the
/// `WatchBridge` Capacitor plugin just forwards JS calls here.
final class WatchSession: NSObject, WCSessionDelegate {
    static let shared = WatchSession()

    private let d = UserDefaults.standard
    private let pendingKey = "seemsfit.pendingWatchWorkouts"
    private let uidKey = "wb.uid", projKey = "wb.projectId", urlKey = "wb.jarvisUrl"

    /// Snapshot + plans + auth share one applicationContext (last-value-wins). Kept merged so
    /// pushing one never clobbers another.
    private var lastContext: [String: Any] = [:]

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
        // Refresh + re-push the token natively on every foreground/background, so even without
        // the (background-frozen) JS timer the watch has a valid token whenever the app is used.
        NotificationCenter.default.addObserver(self, selector: #selector(refreshAndPush),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(refreshAndPush),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    // MARK: Application context (snapshot / plans / auth)

    @discardableResult
    func pushMerged(_ updates: [String: Any]) -> Bool {
        guard WCSession.isSupported() else { return false }
        for (k, v) in updates { lastContext[k] = v }
        lastContext["updatedAt"] = Date().timeIntervalSince1970
        do { try WCSession.default.updateApplicationContext(lastContext); return true }
        catch { return false }
    }

    /// Store the ids so a native refresh can rebuild the auth payload, then push it.
    @discardableResult
    func setAuth(token: String, uid: String, projectId: String, jarvisUrl: String) -> Bool {
        d.set(uid, forKey: uidKey); d.set(projectId, forKey: projKey); d.set(jarvisUrl, forKey: urlKey)
        return pushMerged(["auth": ["token": token, "uid": uid, "projectId": projectId, "jarvisUrl": jarvisUrl]])
    }

    /// A fresh Firebase ID token + the stored ids, or nil if we're not signed in / not set up.
    private func freshAuth(_ completion: @escaping ([String: Any]?) -> Void) {
        guard let uid = d.string(forKey: uidKey),
              let projectId = d.string(forKey: projKey),
              let jarvisUrl = d.string(forKey: urlKey),
              let user = Auth.auth().currentUser else { completion(nil); return }
        user.getIDToken { token, _ in
            guard let token else { completion(nil); return }
            completion(["token": token, "uid": uid, "projectId": projectId, "jarvisUrl": jarvisUrl])
        }
    }

    @objc private func refreshAndPush() {
        freshAuth { [weak self] dict in if let dict { _ = self?.pushMerged(["auth": dict]) } }
    }

    // MARK: Incoming workouts (queued for the JS app to drain)

    func drainPending() -> [Any] {
        let stored = d.array(forKey: pendingKey) as? [String] ?? []
        let workouts: [Any] = stored.compactMap { str in
            guard let data = str.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: data)
        }
        d.removeObject(forKey: pendingKey)
        return workouts
    }

    private func enqueue(_ data: Data) {
        guard let json = String(data: data, encoding: .utf8) else { return }
        var stored = d.array(forKey: pendingKey) as? [String] ?? []
        stored.append(json)
        d.set(stored, forKey: pendingKey)
        NotificationCenter.default.post(name: .watchWorkoutReceived, object: nil)
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let data = userInfo["workout"] as? Data { enqueue(data) }
    }

    /// On-demand token: the watch asks, we mint a fresh one and reply (iOS wakes us if needed).
    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        if (message["req"] as? String) == "token" {
            freshAuth { replyHandler($0 ?? [:]) }
        } else {
            replyHandler([:])
        }
    }
}

extension Notification.Name {
    static let watchWorkoutReceived = Notification.Name("seemsfit.watchWorkoutReceived")
}
