import SwiftUI

/// Today tab: every session scheduled for the current weekday (across all programs), each
/// labelled with its program. Swipe to the Plans tab to browse everything.
struct TodayView: View {
    @EnvironmentObject var connectivity: ConnectivityManager
    @State private var mealSeed = ""
    @State private var goToChat = false

    var body: some View {
        List {
            // Quick action pinned on top — voice-first: tapping opens the watch input mic-first
            // (keyboard/Scribble selectable there); on submit we push the chat with the words
            // already sent, so Vyom logs it with the phone in your pocket. No middle screen.
            TextFieldLink(prompt: Text("Describe your meal")) {
                logMealRow
            } onSubmit: { text in
                mealSeed = text
                goToChat = true
            }
            .buttonStyle(.plain)
            .rowFill()

            if !connectivity.reachable {
                Label("Phone unreachable — logging may not work", systemImage: "iphone.slash")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Band.label)
                    .listRowBackground(Color.clear)
            }

            if todayPlans.isEmpty {
                emptyState
            } else {
                ForEach(Array(todayPlans.enumerated()), id: \.offset) { _, t in
                    NavigationLink {
                        DayDetailView(day: t.day)
                    } label: {
                        todayRow(program: t.program, day: t.day)
                    }
                    .rowFill()
                }
            }
        }
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $goToChat) {
            MealChatView(connectivity: connectivity, initialText: mealSeed)
        }
    }

    private var logMealRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "fork.knife").font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Band.accent).frame(width: 24)
            Text("Log a meal").font(.system(size: 16, weight: .bold))
            Spacer()
        }
        .padding(.vertical, 4)
    }

    /// Every synced day scheduled for the current weekday, across all programs, with its program.
    private var todayPlans: [(program: WatchProgram, day: WatchPlan)] {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "EEEE"
        let today = fmt.string(from: Date())
        var out: [(WatchProgram, WatchPlan)] = []
        for p in connectivity.programs {
            for d in p.days where d.day.caseInsensitiveCompare(today) == .orderedSame {
                out.append((p, d))
            }
        }
        return out
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "calendar").font(.system(size: 22)).foregroundStyle(Band.label)
            Text(connectivity.programs.isEmpty ? "No plans yet" : "Nothing scheduled today")
                .font(.system(size: 15, weight: .bold)).multilineTextAlignment(.center)
            Text(connectivity.programs.isEmpty
                 ? "Sync your plans from the phone."
                 : "Swipe left for Plans to start any day.")
                .font(.system(size: 11)).foregroundStyle(Band.label).multilineTextAlignment(.center)
        }
        .padding(.vertical, 8)
    }

    private func todayRow(program: WatchProgram, day: WatchPlan) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.fill").font(.system(size: 18)).foregroundStyle(Band.accent).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(day.title.isEmpty ? day.day : day.title)
                    .font(.system(size: 15, weight: .bold)).lineLimit(1)
                Text(program.title).font(.system(size: 11)).foregroundStyle(Band.label).lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}

/// The user's programs (synced from the phone), each opening to its days.
struct ProgramsListView: View {
    @EnvironmentObject var connectivity: ConnectivityManager

    var body: some View {
        List {
            if connectivity.programs.isEmpty {
                emptyState
            } else {
                ForEach(connectivity.programs) { program in
                    NavigationLink {
                        DayListView(program: program)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "square.stack.3d.up.fill")
                                .font(.system(size: 17)).foregroundStyle(Band.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(program.title).font(.system(size: 15, weight: .bold)).lineLimit(1)
                                Text("\(program.days.count) day\(program.days.count == 1 ? "" : "s")")
                                    .font(.system(size: 11)).foregroundStyle(Band.label)
                            }
                        }
                    }
                    .rowFill()
                }
            }
        }
        .navigationTitle("Plans")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "applewatch.and.arrow.forward")
                .font(.system(size: 22)).foregroundStyle(.secondary)
            Text("No programs yet").font(.system(size: 15, weight: .bold))
            Text("Open SeemsFit on your phone (Today tab) to sync your plans.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 8)
    }
}

/// A read-only preview of a day's exercises with a sticky "Start Workout" button. Tapping a
/// day no longer starts the session (you may just be looking); the session begins only when
/// Start is tapped (Apple-Fitness style).
struct DayDetailView: View {
    let day: WatchPlan
    @EnvironmentObject private var health: HealthManager
    @EnvironmentObject private var session: WorkoutSessionState

    var body: some View {
        List {
            Section {
                ForEach(day.exercises) { ex in
                    HStack(spacing: 8) {
                        if ex.supersetId != nil {
                            Image(systemName: "link").font(.system(size: 10, weight: .bold)).foregroundStyle(Band.accent)
                        }
                        VStack(alignment: .leading, spacing: 1) {
                            Text(ex.name.isEmpty ? "Exercise" : ex.name)
                                .font(.system(size: 14, weight: .bold)).lineLimit(1)
                            Text(previewDetail(ex)).font(.system(size: 10)).foregroundStyle(Band.label)
                        }
                        Spacer(minLength: 0)
                    }
                    .rowFill()
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            // Present the session over the tabs (see RootView) rather than pushing it here.
            Button { session.activeDay = day } label: {
                Label("Start Workout", systemImage: "play.fill")
                    .font(.system(size: 17, weight: .heavy)).foregroundStyle(.black)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(Band.accent, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 8).padding(.bottom, 4)
        }
    }

    private var title: String {
        day.title.isEmpty ? (day.day.isEmpty ? "Workout" : day.day) : day.title
    }

    private func previewDetail(_ ex: WatchPlanExercise) -> String {
        let setsReps = "\(ex.sets) × \(ex.reps.isEmpty ? "?" : ex.reps)"
        if let last = ex.loggedSets.last, last.weight > 0 {
            let w = last.weight == floor(last.weight) ? "\(Int(last.weight))" : String(format: "%.1f", last.weight)
            return "\(setsReps) · last \(w)kg"
        }
        return setsReps
    }
}

/// The days within a program; tap one to preview, then start.
struct DayListView: View {
    let program: WatchProgram
    @EnvironmentObject var health: HealthManager

    var body: some View {
        List(program.days) { day in
            NavigationLink {
                DayDetailView(day: day)
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 17)).foregroundStyle(Band.accent)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(day.title.isEmpty ? day.day : day.title)
                            .font(.system(size: 15, weight: .bold)).lineLimit(1)
                        Text("\(day.day.isEmpty ? "" : day.day + " · ")\(day.exercises.count) exercise\(day.exercises.count == 1 ? "" : "s")")
                            .font(.system(size: 11)).foregroundStyle(Band.label)
                    }
                }
            }
            .rowFill()
        }
        .navigationTitle(program.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
