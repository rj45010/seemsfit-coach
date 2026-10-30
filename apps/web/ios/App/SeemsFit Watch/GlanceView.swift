import SwiftUI

/// Home glance: three rings (Recovery / Strain / Sleep) from the phone snapshot,
/// today's steps read live on the watch, and a button into the live-workout flow.
struct GlanceView: View {
    @EnvironmentObject var health: HealthManager
    @EnvironmentObject var connectivity: ConnectivityManager

    private var snap: GlanceSnapshot { connectivity.snapshot }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    recoveryRing
                    strainRing
                    sleepRing
                }

                stepsRow

                NavigationLink {
                    WorkoutPickerView()
                } label: {
                    Label("Start workout", systemImage: "figure.run")
                        .font(.system(size: 15, weight: .bold))
                }
                .buttonStyle(.borderedProminent)
                .tint(Band.good)
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("SeemsFit")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { Task { await health.refreshGlance() } }
    }

    private var recoveryRing: some View {
        let r = snap.recovery
        return RingView(
            progress: Double(r ?? 0) / 100,
            color: r == nil ? Band.dim : (r! >= 67 ? Band.good : r! >= 40 ? Band.amber : Band.bad),
            label: "Recovery",
            value: r.map(String.init) ?? "-"
        )
    }

    private var strainRing: some View {
        let s = snap.strain
        return RingView(
            progress: (s ?? 0) / 21,
            color: s == nil ? Band.dim : Band.amber,
            label: "Strain",
            value: s.map { String(Int($0.rounded())) } ?? "-"
        )
    }

    private var sleepRing: some View {
        let m = snap.sleepMin
        let color = m == nil ? Band.dim : (m! >= 420 ? Band.good : m! >= 360 ? Band.amber : Band.bad)
        let value = m.map { "\($0 / 60)h\($0 % 60)" } ?? "-"
        return RingView(progress: Double(m ?? 0) / 480, color: color, label: "Sleep", value: value)
    }

    private var stepsRow: some View {
        HStack {
            Image(systemName: "shoeprints.fill").foregroundStyle(.secondary)
            Text("\(health.stepsToday)")
                .font(.system(size: 20, weight: .bold, design: .rounded))
            Text("steps").font(.system(size: 12)).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 6)
    }
}
