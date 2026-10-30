import SwiftUI
import HealthKit

/// The categories offered on the watch, mapped to HKWorkoutActivityType. The category
/// names match the app's WorkoutCategory union so the phone maps them straight back.
struct WatchActivity: Identifiable {
    let id = UUID()
    let name: String
    let icon: String
    let type: HKWorkoutActivityType
}

let WATCH_ACTIVITIES: [WatchActivity] = [
    .init(name: "Strength", icon: "dumbbell.fill", type: .traditionalStrengthTraining),
    .init(name: "Running", icon: "figure.run", type: .running),
    .init(name: "Cycling", icon: "figure.outdoor.cycle", type: .cycling),
    .init(name: "Walking", icon: "figure.walk", type: .walking),
    .init(name: "Hiking", icon: "figure.hiking", type: .hiking),
    .init(name: "HIIT", icon: "bolt.heart.fill", type: .highIntensityIntervalTraining),
    .init(name: "Yoga", icon: "figure.yoga", type: .yoga),
    .init(name: "Core", icon: "figure.core.training", type: .coreTraining),
    .init(name: "Other", icon: "figure.mixed.cardio", type: .other),
]

struct WorkoutPickerView: View {
    @EnvironmentObject var health: HealthManager

    var body: some View {
        List(WATCH_ACTIVITIES) { activity in
            NavigationLink {
                ActiveWorkoutView(activity: activity, healthStore: health.store)
            } label: {
                Label(activity.name, systemImage: activity.icon)
                    .font(.system(size: 15, weight: .semibold))
            }
        }
        .navigationTitle("Choose")
        .navigationBarTitleDisplayMode(.inline)
    }
}
