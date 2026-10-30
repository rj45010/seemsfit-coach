import SwiftUI
import HealthKit

/// Live workout with TWO pages (swipe horizontally):
///   • Metrics-elapsed timer, HR, active energy, distance, End button.
///   • Log-full strength logger (sets/reps/RPE, supersets, rest timer).
/// On End the HKWorkout saves to HealthKit AND the logged sets + measured metrics are
/// sent to the phone, which writes the complete record to Firestore. No phone needed
/// during the session.
struct ActiveWorkoutView: View {
    let activity: WatchActivity
    @StateObject private var manager: WorkoutManager
    @StateObject private var store = SetLogStore()
    @EnvironmentObject private var connectivity: ConnectivityManager
    @Environment(\.dismiss) private var dismiss

    private let isStrength: Bool

    init(activity: WatchActivity, healthStore: HKHealthStore) {
        self.activity = activity
        self.isStrength = activity.type == .traditionalStrengthTraining || activity.type == .coreTraining
        _manager = StateObject(wrappedValue: WorkoutManager(store: healthStore))
    }

    var body: some View {
        Group {
            if manager.finished {
                summary
            } else if isStrength {
                TabView {
                    metricsPage.tag(0)
                    WorkoutLogView().tag(1)
                }
                .tabViewStyle(.page)
            } else {
                metricsPage
            }
        }
        .environmentObject(store)
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(manager.running)
        .onAppear {
            if !manager.running && !manager.finished {
                if let p = connectivity.calorieProfile {
                    manager.calorieModel = WatchCalorieModel(weightKg: p.weightKg, ageYears: p.ageYears, sex: p.sex)
                }
                manager.start(activity.type)
            }
        }
        .fullScreenCover(isPresented: $store.showRest) {
            RestView().environmentObject(store)
        }
    }

    private var metricsPage: some View {
        VStack(spacing: 8) {
            Text(timeString(manager.elapsed))
                .font(.system(size: 32, weight: .bold, design: .rounded)).monospacedDigit()
            HStack(spacing: 14) {
                metric("\(Int(manager.heartRate))", "bpm", "heart.fill", Band.bad)
                metric("\(Int(manager.ourEnergy))", "kcal", "flame.fill", Band.amber)
            }
            if isStrength {
                Text("\(store.totalSets) sets logged").font(.system(size: 11)).foregroundStyle(.secondary)
                Text("Swipe ‹ to log sets").font(.system(size: 10)).foregroundStyle(.secondary)
            } else if manager.distance > 0 {
                metric(String(format: "%.2f", manager.distance / 1000), "km", "location.fill", Band.good)
            }
            Button(role: .destructive) { manager.end() } label: {
                Label("End", systemImage: "stop.fill").font(.system(size: 15, weight: .bold))
            }
            .buttonStyle(.borderedProminent).tint(Band.bad)
        }
        .padding(.horizontal, 6)
    }

    private var summary: some View {
        VStack(spacing: 6) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 32)).foregroundStyle(Band.good)
            Text("Saved").font(.system(size: 18, weight: .bold))
            Text("\(timeString(manager.elapsed)) · \(Int(manager.ourEnergy)) kcal")
                .font(.system(size: 13)).foregroundStyle(.secondary)
            if isStrength { Text("\(store.totalSets) sets sent to phone").font(.system(size: 11)).foregroundStyle(.secondary) }
            Button("Done") { sendAndClose() }.buttonStyle(.borderedProminent).tint(Band.good).padding(.top, 4)
        }
        .padding()
        .onAppear(perform: send) // fire-and-forget the moment the summary shows
    }

    private func send() {
        let now = Date().timeIntervalSince1970
        let payload = WorkoutPayload(
            category: activity.name,
            startDate: now - manager.elapsed,
            endDate: now,
            durationSec: manager.elapsed,
            activeEnergyKcal: manager.ourEnergy,
            distanceMeters: manager.distance,
            avgHr: manager.heartRate,
            exercises: store.cleaned()
        )
        connectivity.sendWorkout(payload)
    }

    private func sendAndClose() {
        store.clear()
        dismiss()
    }

    private func metric(_ value: String, _ unit: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 0) {
            Image(systemName: icon).foregroundStyle(color).font(.system(size: 12))
            Text(value).font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit()
            Text(unit).font(.system(size: 9)).foregroundStyle(.secondary)
        }
    }

    private func timeString(_ t: TimeInterval) -> String {
        let s = Int(t)
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}
