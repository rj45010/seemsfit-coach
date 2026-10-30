import Foundation
import Capacitor
import HealthKit

/// Phone-owned HealthKit workout writes + deletes, so SeemsFit sessions can live in Apple
/// Fitness and deletion stays in sync BOTH ways:
///   - save: the phone (not the watch) writes the HKWorkout, so the phone is the owner and is
///     therefore allowed to delete it later (HealthKit only lets an app delete what it saved).
///   - delete: remove a workout we wrote, by its UUID.
///   - deletedSince: an anchored query that reports workouts deleted from Apple Health since
///     the last call, so the web layer can drop the matching Firestore docs and tombstone them.
///
/// JS usage (see src/lib/healthWorkouts.ts).
@objc(HealthWorkoutsBridge)
public class HealthWorkoutsBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthWorkoutsBridge"
    public let jsName = "HealthWorkouts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deletedSince", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let anchorKey = "seemsfit.workoutDeletionAnchor"

    // Map our coarse category string to an HK activity type.
    private func activity(_ s: String) -> HKWorkoutActivityType {
        switch s.lowercased() {
        case "running": return .running
        case "walking": return .walking
        case "hiking": return .hiking
        case "cycling": return .cycling
        case "swimming": return .swimming
        case "strength": return .traditionalStrengthTraining
        case "hiit": return .highIntensityIntervalTraining
        case "yoga": return .yoga
        case "core": return .coreTraining
        default: return .other
        }
    }

    /// Request share (write/delete) + read access for workouts and the samples we attach.
    @objc func requestShare(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["ok": false]); return }
        var share: Set<HKSampleType> = [HKObjectType.workoutType()]
        for id in [HKQuantityTypeIdentifier.activeEnergyBurned, .distanceWalkingRunning] {
            if let q = HKQuantityType.quantityType(forIdentifier: id) { share.insert(q) }
        }
        store.requestAuthorization(toShare: share, read: [HKObjectType.workoutType()]) { ok, _ in
            call.resolve(["ok": ok])
        }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let startMs = call.getDouble("start"), let endMs = call.getDouble("end") else {
            call.resolve([:]); return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let config = HKWorkoutConfiguration()
        config.activityType = activity(call.getString("category") ?? "other")

        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        builder.beginCollection(withStart: start) { ok, _ in
            guard ok else { call.resolve([:]); return }
            var samples: [HKSample] = []
            if let kcal = call.getDouble("calories"), kcal > 0,
               let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
                samples.append(HKQuantitySample(type: t, quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal), start: start, end: end))
            }
            if let km = call.getDouble("distanceKm"), km > 0,
               let t = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
                samples.append(HKQuantitySample(type: t, quantity: HKQuantity(unit: .meter(), doubleValue: km * 1000), start: start, end: end))
            }
            let finish = {
                builder.endCollection(withEnd: end) { _, _ in
                    builder.finishWorkout { workout, _ in
                        if let w = workout { call.resolve(["uuid": w.uuid.uuidString]) } else { call.resolve([:]) }
                    }
                }
            }
            if samples.isEmpty { finish() } else { builder.add(samples) { _, _ in finish() } }
        }
    }

    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let str = call.getString("uuid"), let uuid = UUID(uuidString: str) else {
            call.resolve(["ok": false]); return
        }
        let q = HKSampleQuery(sampleType: .workoutType(), predicate: HKQuery.predicateForObject(with: uuid),
                              limit: 1, sortDescriptors: nil) { [weak self] _, samples, _ in
            guard let self else { call.resolve(["ok": false]); return }
            guard let obj = samples?.first else { call.resolve(["ok": true]); return } // already gone
            self.store.delete(obj) { ok, _ in call.resolve(["ok": ok]) }
        }
        store.execute(q)
    }

    /// Returns UUIDs of workouts deleted from Apple Health since the last call. The first call
    /// just establishes a baseline anchor (returns none), so we never mass-delete on startup.
    @objc func deletedSince(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["uuids": []]); return }
        let anchor = loadAnchor()
        let q = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: nil,
                                      anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] _, _, deleted, newAnchor, _ in
            if let a = newAnchor { self?.saveAnchor(a) }
            let uuids = (deleted ?? []).map { $0.uuid.uuidString }
            call.resolve(["uuids": uuids])
        }
        store.execute(q)
    }

    // MARK: Anchor persistence
    private func loadAnchor() -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: anchorKey) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }
    private func saveAnchor(_ anchor: HKQueryAnchor) {
        if let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) {
            UserDefaults.standard.set(data, forKey: anchorKey)
        }
    }
}
