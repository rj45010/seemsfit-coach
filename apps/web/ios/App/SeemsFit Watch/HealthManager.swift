import Foundation
import HealthKit

/// Wraps HealthKit on the watch: requests permission, reads today's steps live, and
/// shares the read/write types the live-workout flow needs. Mirrors the supported
/// quantity types already proven on the phone (NO vo2Max-requesting an unsupported
/// type throws the whole authorization batch).
@MainActor
final class HealthManager: ObservableObject {
    let store = HKHealthStore()

    @Published var stepsToday: Int = 0
    @Published var authorized = false

    // Types we read on the watch for the glance + live workout. Date of birth (a read-only
    // characteristic) lets us derive real HR zones instead of a nominal max.
    private var readTypes: Set<HKObjectType> {
        var t: Set<HKObjectType> = [HKObjectType.workoutType()]
        let ids: [HKQuantityTypeIdentifier] = [
            .stepCount, .heartRate, .activeEnergyBurned,
            .distanceWalkingRunning, .appleExerciseTime,
        ]
        for id in ids { if let q = HKQuantityType.quantityType(forIdentifier: id) { t.insert(q) } }
        if let dob = HKCharacteristicType.characteristicType(forIdentifier: .dateOfBirth) { t.insert(dob) }
        return t
    }

    // We write the workout itself plus the samples the live builder collects.
    private var shareTypes: Set<HKSampleType> {
        var t: Set<HKSampleType> = [HKObjectType.workoutType()]
        let ids: [HKQuantityTypeIdentifier] = [.activeEnergyBurned, .distanceWalkingRunning, .heartRate]
        for id in ids { if let q = HKQuantityType.quantityType(forIdentifier: id) { t.insert(q) } }
        return t
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
            authorized = true
            loadMaxHR()
        } catch {
            // iOS never reveals read-grant status; failures here are real (e.g. unsupported type).
            print("HealthKit auth error: \(error)")
        }
    }

    /// Derive the user's max HR from their Health-app date of birth (Fox formula, 220 − age) and
    /// feed it to `HRZone`. If DOB isn't shared, `HRZone.maxHR` keeps its nominal fallback.
    private func loadMaxHR() {
        guard let comps = try? store.dateOfBirthComponents(),
              let birth = Calendar.current.date(from: comps) else { return }
        let age = Calendar.current.dateComponents([.year], from: birth, to: Date()).year ?? 0
        guard age > 0, age < 120 else { return }
        HRZone.maxHR = Double(220 - age)
    }

    /// Sum of today's step count, used as the live steps figure on the glance.
    func refreshGlance() async {
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }
        let start = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let steps: Double = await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0)
            }
            store.execute(q)
        }
        stepsToday = Int(steps)
    }
}
