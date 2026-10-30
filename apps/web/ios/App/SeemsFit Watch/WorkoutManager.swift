import Foundation
import HealthKit

/// Our calorie model (Keytel 2005) — kept in sync with src/lib/calories.ts on the web.
/// kcal/min from heart rate + weight + age + sex; "other" averages the two regressions.
struct WatchCalorieModel {
    var weightKg: Double = 70
    var ageYears: Int = 30
    var sex: String = "other"   // "male" | "female" | "other"

    func kcalPerMin(hr: Double) -> Double {
        let w = weightKg, a = Double(ageYears)
        let male = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184
        let female = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184
        let v = sex == "male" ? male : sex == "female" ? female : (male + female) / 2
        return max(0, v)
    }
}

/// Drives a live workout with HKWorkoutSession + HKLiveWorkoutBuilder. Publishes
/// elapsed time, heart rate, active energy and distance for the active screen, and
/// on end finishes an HKWorkout into HealthKit-which the phone later syncs into a
/// `users/{uid}/workouts/ahk_*` doc via the existing syncTodayWorkouts pipeline.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    private let store: HKHealthStore
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    @Published var running = false
    @Published var paused = false
    @Published var heartRate: Double = 0      // most-recent BPM (live screen)
    @Published var avgHeartRate: Double = 0   // average BPM over the session (summary)
    @Published var activeEnergy: Double = 0   // kcal (Apple, movement) — kept for reference
    @Published var basalEnergy: Double = 0    // kcal (resting)
    @Published var ourEnergy: Double = 0      // kcal — OUR model (Keytel), the displayed number
    @Published var distance: Double = 0       // meters
    @Published var elapsed: TimeInterval = 0
    @Published var finished = false

    /// Calorie profile (weight/age/sex) vended by the phone; set before start.
    var calorieModel = WatchCalorieModel()

    /// Total calories = our active burn + Apple's resting (basal) energy.
    var totalEnergy: Double { ourEnergy + basalEnergy }

    private var startDate: Date?
    private var timer: Timer?

    init(store: HKHealthStore) {
        self.store = store
        super.init()
    }

    func start(_ activity: HKWorkoutActivityType) {
        let config = HKWorkoutConfiguration()
        config.activityType = activity
        config.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self

            self.session = session
            self.builder = builder

            let start = Date()
            startDate = start
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }
            running = true
            startTimer()
        } catch {
            print("Failed to start workout: \(error)")
        }
    }

    func pause() {
        session?.pause()
        paused = true
        timer?.invalidate()   // freeze the elapsed clock
    }

    func resume() {
        session?.resume()
        paused = false
        startDate = Date().addingTimeInterval(-elapsed)  // continue from where we froze
        startTimer()
    }

    func end() {
        running = false
        timer?.invalidate()
        session?.end()
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.startDate else { return }
                self.elapsed = Date().timeIntervalSince(start)
                // Integrate our calorie model each second from the live HR (paused with the timer).
                if self.heartRate > 40 {
                    self.ourEnergy += self.calorieModel.kcalPerMin(hr: self.heartRate) / 60.0
                }
            }
        }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ session: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in
            guard let builder = self.builder else { return }
            _ = try? await builder.endCollection(at: date)
            // Discard the HKWorkout: saving it puts a copy in Apple Health, but deleting the
            // session in our app can't delete that HealthKit copy, so the importer kept
            // re-creating deleted workouts. The watch→phone payload (wkt_*) is the single
            // source of truth. (Showing sessions in Apple Fitness needs two-way deletion and
            // is deferred.)
            builder.discardWorkout()
            self.finished = true
        }
    }

    nonisolated func workoutSession(_ session: HKWorkoutSession, didFailWithError error: Error) {
        print("Workout session error: \(error)")
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let qType = type as? HKQuantityType,
                  let stats = workoutBuilder.statistics(for: qType) else { continue }
            Task { @MainActor in self.apply(qType, stats) }
        }
    }

    @MainActor
    private func apply(_ type: HKQuantityType, _ stats: HKStatistics) {
        switch type {
        case HKQuantityType.quantityType(forIdentifier: .heartRate):
            let unit = HKUnit.count().unitDivided(by: .minute())
            heartRate = stats.mostRecentQuantity()?.doubleValue(for: unit) ?? heartRate
            avgHeartRate = stats.averageQuantity()?.doubleValue(for: unit) ?? avgHeartRate
        case HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned):
            activeEnergy = stats.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? activeEnergy
        case HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned):
            basalEnergy = stats.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? basalEnergy
        case HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning):
            distance = stats.sumQuantity()?.doubleValue(for: .meter()) ?? distance
        default:
            break
        }
    }
}
