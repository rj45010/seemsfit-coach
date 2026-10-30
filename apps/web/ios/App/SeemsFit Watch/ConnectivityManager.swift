import Foundation
import WatchConnectivity

/// The Recovery/Strain/Sleep snapshot the phone computes and pushes to the watch.
/// The watch never recomputes these-it only displays what the app already derived,
/// so the rings always match the phone.
struct GlanceSnapshot: Codable, Equatable {
    var recovery: Int?      // 0-100
    var strain: Double?     // 0-21
    var sleepMin: Int?      // total sleep minutes
    var steps: Int?         // phone's step figure (watch prefers its own live read)
    var updatedAt: Double?  // epoch seconds

    static let empty = GlanceSnapshot()
}

// MARK: Workout plans pushed from the phone

/// A single planned set's defaults (last time's load), used to pre-fill the logger.
struct WatchPlanSet: Codable, Equatable {
    var weight: Double = 0
    var reps: Int = 0          // -1 = "F" (to failure)
    var rpe: Double? = nil
    var bodyweight: Bool = false
}

/// One exercise in a plan: planned set count + target reps, plus optional last-logged sets.
struct WatchPlanExercise: Codable, Equatable, Identifiable {
    var id = UUID()
    var name: String = ""
    var sets: Int = 0
    var reps: String = ""               // planned reps (may be a range like "8-12")
    var supersetId: String? = nil       // exercises sharing this are trained back-to-back
    var loggedSets: [WatchPlanSet] = []  // last time's loads, to seed the wheels

    private enum CodingKeys: String, CodingKey { case name, sets, reps, supersetId, loggedSets }
}

/// One day of a program: the exercises to log. (`Plan` on the phone.)
struct WatchPlan: Codable, Equatable, Identifiable {
    var id: String = ""
    var title: String = ""              // the day's title, e.g. "Push"
    var day: String = ""                // weekday, e.g. "Monday"
    var category: String = "Strength"
    var exercises: [WatchPlanExercise] = []
}

/// A named program grouping several day-plans. (`Program` on the phone.)
struct WatchProgram: Codable, Equatable, Identifiable {
    var id: String = ""
    var title: String = ""
    var days: [WatchPlan] = []
}

/// Auth vended by the phone so the watch can call Seemsfit AI and write meals on its own.
struct WatchAuth: Equatable {
    var token: String
    var uid: String
    var projectId: String
    var jarvisUrl: String
}

/// Calorie-model inputs vended by the phone (from the app profile + latest logged weight).
struct WatchCalorieProfile: Equatable {
    var weightKg: Double
    var ageYears: Int
    var sex: String   // "male" | "female" | "other"
}

/// Receives the phone's applicationContext over WatchConnectivity and republishes it:
/// the glance snapshot (legacy) and-what the app now centers on-the user's workout plans.
@MainActor
final class ConnectivityManager: NSObject, ObservableObject {
    @Published var snapshot: GlanceSnapshot = .empty
    @Published var programs: [WatchProgram] = []
    @Published var auth: WatchAuth?
    @Published var reachable = false   // is the phone reachable right now (for the meal-log hint)
    @Published var calorieProfile: WatchCalorieProfile?   // weight/age/sex vended by the phone

    private let plansKey = "seemsfit.programs"

    override init() {
        super.init()
        restorePlans()
        #if targetEnvironment(simulator)
        if programs.isEmpty { programs = Self.sampleProgram() }  // testing only; never on device
        #endif
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    #if targetEnvironment(simulator)
    /// A demo program (today's weekday) so the watch is fully navigable in the Simulator with
    /// no paired phone — includes a 2-exercise superset to exercise the round flow.
    static func sampleProgram() -> [WatchProgram] {
        let fmt = DateFormatter(); fmt.locale = Locale(identifier: "en_US_POSIX"); fmt.dateFormat = "EEEE"
        let today = fmt.string(from: Date())
        func ex(_ name: String, _ sets: Int, _ reps: String, ss: String? = nil, w: Double) -> WatchPlanExercise {
            var e = WatchPlanExercise()
            e.name = name; e.sets = sets; e.reps = reps; e.supersetId = ss
            e.loggedSets = (0..<sets).map { _ in WatchPlanSet(weight: w, reps: Int(reps) ?? 8, rpe: nil, bodyweight: false) }
            return e
        }
        var day = WatchPlan()
        day.id = "sim-day"; day.title = "Test Day"; day.day = today; day.category = "Strength"
        day.exercises = [
            ex("Bench Press", 3, "8", w: 60),
            ex("Incline DB", 3, "10", ss: "A", w: 24),
            ex("Cable Fly", 3, "12", ss: "A", w: 15),
        ]
        var prog = WatchProgram()
        prog.id = "sim-prog"; prog.title = "Demo Program"; prog.days = [day]
        return [prog]
    }
    #endif

    /// Ask the phone for a FRESH Vyom token on demand. iOS wakes the phone app's native
    /// WatchConnectivity handler (even if suspended) to mint one, so this works with the phone
    /// pocketed. Updates `auth` and returns it; nil if the phone is unreachable / not signed in.
    func requestFreshAuth() async -> WatchAuth? {
        guard WCSession.isSupported() else { return nil }
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return nil }
        // Hard timeout: if the phone is reachable but its app can't reply (e.g. just reinstalled and
        // never launched, so WatchSession isn't active), sendMessage can hang. Guarantee we resume
        // within 10s with nil so the UI shows a clear error instead of spinning forever.
        let lock = NSLock()
        var done = false
        return await withCheckedContinuation { (cont: CheckedContinuation<WatchAuth?, Never>) in
            func finish(_ v: WatchAuth?) {
                lock.lock(); defer { lock.unlock() }
                if done { return }
                done = true
                cont.resume(returning: v)
            }
            s.sendMessage(["req": "token"], replyHandler: { reply in
                guard let t = reply["token"] as? String, let u = reply["uid"] as? String,
                      let p = reply["projectId"] as? String, let j = reply["jarvisUrl"] as? String else {
                    finish(nil); return
                }
                let a = WatchAuth(token: t, uid: u, projectId: p, jarvisUrl: j)
                Task { @MainActor in self.auth = a }
                finish(a)
            }, errorHandler: { _ in finish(nil) })
            DispatchQueue.global().asyncAfter(deadline: .now() + 10) { finish(nil) }
        }
    }

    /// Send a finished workout to the phone. Uses transferUserInfo so it's queued and
    /// delivered reliably even if the phone app isn't currently in the foreground; the
    /// phone enqueues it and the web app writes it to Firestore on next open.
    func sendWorkout(_ payload: WorkoutPayload) {
        guard WCSession.isSupported(), let data = try? JSONEncoder().encode(payload) else { return }
        WCSession.default.transferUserInfo(["workout": data])
    }

    private func apply(_ context: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: context),
           let snap = try? JSONDecoder().decode(GlanceSnapshot.self, from: data) {
            Task { @MainActor in self.snapshot = snap }
        }
        // Programs ride along in the same applicationContext under a "plans" key, as JSON.
        if let str = context["plans"] as? String,
           let data = str.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([WatchProgram].self, from: data) {
            UserDefaults.standard.set(data, forKey: plansKey)
            Task { @MainActor in self.programs = decoded }
        }
        // Auth token (kept in memory only-short-lived) so the watch can call Seemsfit AI.
        if let a = context["auth"] as? [String: Any],
           let t = a["token"] as? String, let u = a["uid"] as? String,
           let p = a["projectId"] as? String, let j = a["jarvisUrl"] as? String {
            Task { @MainActor in self.auth = WatchAuth(token: t, uid: u, projectId: p, jarvisUrl: j) }
        }
        // Calorie-model inputs (weight/age/sex) so live sessions compute our kcal (Keytel).
        if let c = context["calorieProfile"] as? [String: Any], let w = c["weightKg"] as? Double {
            let prof = WatchCalorieProfile(
                weightKg: w,
                ageYears: (c["ageYears"] as? Int) ?? 30,
                sex: (c["sex"] as? String) ?? "other"
            )
            Task { @MainActor in self.calorieProfile = prof }
        }
    }

    private func restorePlans() {
        guard let data = UserDefaults.standard.data(forKey: plansKey),
              let decoded = try? JSONDecoder().decode([WatchProgram].self, from: data) else { return }
        programs = decoded
    }
}

extension ConnectivityManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        // On activation, adopt whatever context the phone last set.
        let ctx = session.receivedApplicationContext
        let r = session.isReachable
        Task { @MainActor in
            self.reachable = r
            if !ctx.isEmpty { self.apply(ctx) }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.apply(applicationContext) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let r = session.isReachable
        Task { @MainActor in self.reachable = r }
    }
}
