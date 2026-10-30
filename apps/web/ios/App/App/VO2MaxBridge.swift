import Foundation
import Capacitor
import HealthKit

/// Reads the latest VO2 max sample (Apple's "Cardio Fitness", measured by the Watch) straight
/// from HealthKit. The Capgo health plugin doesn't expose vo2Max, so we read it natively here
/// and the web layer merges it into dailyMetrics. Requests only the vo2Max read scope on its
/// own, so it never trips the batch-authorization issue that an unsupported type caused before.
///
/// JS usage (see src/lib/vo2max.ts):
///   VO2Max.latest() -> { value?: Double (ml/kg·min), date?: ISO8601 }
@objc(VO2MaxBridge)
public class VO2MaxBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VO2MaxBridge"
    public let jsName = "VO2Max"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "latest", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    @objc func latest(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let type = HKQuantityType.quantityType(forIdentifier: .vo2Max) else {
            call.resolve([:]); return
        }
        store.requestAuthorization(toShare: nil, read: [type]) { [weak self] _, _ in
            guard let self else { call.resolve([:]); return }
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let q = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                guard let s = samples?.first as? HKQuantitySample else { call.resolve([:]); return }
                let value = s.quantity.doubleValue(for: HKUnit(from: "ml/kg*min"))
                let when = ISO8601DateFormatter().string(from: s.endDate)
                call.resolve(["value": value, "date": when])
            }
            self.store.execute(q)
        }
    }
}
