import WidgetKit
import SwiftUI
import HealthKit

/// Timeline entry holding today's step count.
struct StepsEntry: TimelineEntry {
    let date: Date
    let steps: Int
}

/// Reads today's steps from HealthKit and refreshes a few times an hour. Complications
/// get limited refresh budget, so we schedule the next reload ~30 min out.
struct StepsProvider: TimelineProvider {
    private let store = HKHealthStore()

    func placeholder(in context: Context) -> StepsEntry { StepsEntry(date: Date(), steps: 6500) }

    func getSnapshot(in context: Context, completion: @escaping (StepsEntry) -> Void) {
        fetchSteps { completion(StepsEntry(date: Date(), steps: $0)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StepsEntry>) -> Void) {
        fetchSteps { steps in
            let entry = StepsEntry(date: Date(), steps: steps)
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func fetchSteps(_ done: @escaping (Int) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: .stepCount) else { done(0); return }
        let start = Calendar.current.startOfDay(for: Date())
        let pred = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: .cumulativeSum) { _, stats, _ in
            done(Int(stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0))
        }
        store.execute(q)
    }
}

/// The complication views, sized for accessoryCircular and accessoryInline faces.
struct StepsComplicationView: View {
    @Environment(\.widgetFamily) var family
    var entry: StepsEntry

    private var stepsLabel: String {
        entry.steps >= 1000 ? String(format: "%.1fk", Double(entry.steps) / 1000) : "\(entry.steps)"
    }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("\(entry.steps) steps", systemImage: "shoeprints.fill")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "shoeprints.fill").font(.system(size: 11))
                    Text(stepsLabel).font(.system(size: 14, weight: .bold, design: .rounded)).minimumScaleFactor(0.6)
                }
            }
        default:
            Text(stepsLabel)
        }
    }
}

@main
struct StepsComplication: Widget {
    let kind = "SeemsFitSteps"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StepsProvider()) { entry in
            StepsComplicationView(entry: entry)
                .widgetURL(URL(string: "seemsfit://glance"))
        }
        .configurationDisplayName("Steps")
        .description("Today's step count.")
        .supportedFamilies([.accessoryCircular, .accessoryInline])
    }
}
