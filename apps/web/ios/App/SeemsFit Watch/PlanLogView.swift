import SwiftUI
import HealthKit
import WatchKit

/// Logs one day of a program, Apple-Workout style: a 3-2-1 countdown starts a background
/// HealthKit strength session, then a two-page swipe-live metrics (timer/HR/energy) and
/// the exercise list. Logging an RPE pops a full-screen rest timer (buzz at 10s, buzz +
/// auto-close at 0). "Log workout" ends the session and syncs sets + metrics to the phone.
struct DayLogView: View {
    let day: WatchPlan
    @StateObject private var manager: WorkoutManager
    @StateObject private var store: SetLogStore
    @EnvironmentObject private var connectivity: ConnectivityManager
    @EnvironmentObject private var session: WorkoutSessionState
    @Environment(\.dismiss) private var dismiss

    @State private var countdown = 3
    @State private var counting = true

    init(day: WatchPlan, healthStore: HKHealthStore) {
        self.day = day
        _manager = StateObject(wrappedValue: WorkoutManager(store: healthStore))
        _store = StateObject(wrappedValue: SetLogStore(plan: day))
    }

    var body: some View {
        Group {
            if manager.finished {
                savedView
            } else if counting {
                CountdownView(count: countdown)
            } else {
                TabView {
                    metricsPage.tag(0)
                    exercisesPage.tag(1)
                }
                .tabViewStyle(.page)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        // Once a day starts there's no going back-the workout is live; you must Stop to
        // end it (which logs). The back button returns only on the saved/summary screen.
        .navigationBarBackButtonHidden(!manager.finished)
        .fullScreenCover(isPresented: $store.showRest) { RestView().environmentObject(store) }
        // Clear the "workout live" flag only when the finished workout is dismissed-NOT when
        // the view merely backgrounds (screen off), so the home-reset never tears down a live
        // session and tracking keeps running.
        .onDisappear { if manager.finished { session.active = false } }
        .task {
            guard counting else { return }
            session.active = true   // protects the in-progress workout from the home reset
            WKInterfaceDevice.current().play(.start)
            for n in stride(from: 3, through: 1, by: -1) {
                countdown = n
                WKInterfaceDevice.current().play(.click)
                try? await Task.sleep(for: .seconds(1))
            }
            counting = false
            if let p = connectivity.calorieProfile {
                manager.calorieModel = WatchCalorieModel(weightKg: p.weightKg, ageYears: p.ageYears, sex: p.sex)
            }
            manager.start(.traditionalStrengthTraining)
        }
    }

    private var title: String { day.title.isEmpty ? (day.day.isEmpty ? "Workout" : day.day) : day.title }

    // Page 1 — elapsed time is the single hero (accent); the other metrics are smaller white
    // stats. Pause (tonal) / Stop (red) stacked on the right.
    private var metricsPage: some View {
        // Ambient glow tints with the live HR zone (blue easy → red max); dim before any reading.
        let zoneColor = manager.heartRate > 40 ? HRZone.color(HRZone.index(manager.heartRate)) : Band.accent
        return ZStack {
            ScreenBackground(tint: zoneColor)
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 6) {
                    liveStat(timeString(manager.elapsed), "TIME",
                             manager.paused ? Band.label : Band.accent, big: true)
                    liveStat("\(Int(manager.ourEnergy))", "ACTIVE KCAL", .white)
                    liveStat("\(Int(manager.totalEnergy))", "TOTAL KCAL", .white)
                    VStack(alignment: .leading, spacing: 3) {
                        liveStat("\(Int(manager.heartRate))", "BPM", .white)
                        HRZoneBar(bpm: manager.heartRate).frame(width: 86)
                    }
                }
                Spacer(minLength: 0)
                VStack(spacing: 8) {
                    controlButton(manager.paused ? "play.fill" : "pause.fill", Band.tonal) {
                        manager.paused ? manager.resume() : manager.pause()
                    }
                    controlButton("stop.fill", Band.stop) { manager.end() }
                }
                .frame(width: 62)
            }
            .padding(.horizontal, 8)
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }

    private func liveStat(_ value: String, _ label: String, _ color: Color, big: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.system(size: 9, weight: .semibold)).foregroundStyle(Band.label)
            Text(value)
                .font(.system(size: big ? 46 : 22, weight: .bold, design: .rounded))
                .monospacedDigit().minimumScaleFactor(0.7).lineLimit(1).foregroundStyle(color)
        }
    }

    // Tall rounded-rectangle controls (Apple-Watch style): large, easy to hit, but a FIXED
    // height so they never grow past the content area into the navigation title.
    private func controlButton(_ icon: String, _ color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .bold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 66)
                .background(color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // Plan exercises grouped into "units": a lone exercise, or a superset group shown as one
    // row that runs the guided round flow. Preserves plan order; groups by shared supersetId.
    private var units: [[LoggedExercise]] {
        var result: [[LoggedExercise]] = []
        var seen = Set<Int>()
        for ex in store.exercises {
            if let sid = ex.supersetId {
                if seen.contains(sid) { continue }
                seen.insert(sid)
                result.append(store.exercises.filter { $0.supersetId == sid })
            } else {
                result.append([ex])
            }
        }
        return result
    }

    // Sets logged vs planned across all non-skipped exercises — drives the top progress bar.
    private var setProgress: (done: Int, total: Int) {
        let active = store.exercises.filter { !$0.skipped }
        let done = active.reduce(0) { $0 + $1.sets.filter { $0.logged }.count }
        let total = active.reduce(0) { $0 + $1.sets.count }
        return (done, total)
    }

    // Page 2-the exercises to log + the finish button.
    private var exercisesPage: some View {
        let p = setProgress
        return List {
            Section {
                ForEach(units.indices, id: \.self) { i in
                    let unit = units[i]
                    if unit.count == 1 {
                        let ex = unit[0]
                        NavigationLink { ExerciseLogView(store: store, exerciseId: ex.id) } label: { exerciseRow(ex) }
                            .swipeActions(edge: .trailing) {
                                Button { store.toggleSkip(ex.id) } label: {
                                    Label(ex.skipped ? "Unskip" : "Skip",
                                          systemImage: ex.skipped ? "arrow.uturn.backward" : "forward.fill")
                                }
                                .tint(ex.skipped ? Band.success : Band.dim)
                            }
                            .rowFill()
                    } else {
                        NavigationLink { SupersetRoundView(store: store, groupIds: unit.map { $0.id }) } label: { supersetRow(unit) }
                            .rowFill()
                    }
                }
            }
            Section {
                Button { manager.end() } label: {
                    Label("Log workout", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .rowFill(Band.accent)
            }
        }
        // Progress lives in a thin pinned strip above the list (out of the section flow, so it
        // takes almost no height) and stays visible while the exercises scroll.
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack(spacing: 8) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Band.tonal)
                        Capsule().fill(Band.accent)
                            .frame(width: geo.size.width * (p.total > 0 ? Double(p.done) / Double(p.total) : 0))
                    }
                }
                .frame(maxWidth: .infinity).frame(height: 4)
                .animation(.easeOut(duration: 0.25), value: p.done)
                Text("\(p.done)/\(p.total)").font(.system(size: 10, weight: .bold)).foregroundStyle(Band.label).fixedSize()
            }
            .padding(.horizontal, 12).padding(.top, 2).padding(.bottom, 4)
        }
    }

    // One row standing in for a whole superset group; opens the guided round flow.
    private func supersetRow(_ unit: [LoggedExercise]) -> some View {
        let done = unit.reduce(0) { $0 + $1.sets.filter { $0.logged }.count }
        let total = unit.reduce(0) { $0 + $1.sets.count }
        return HStack(spacing: 6) {
            Image(systemName: "link").font(.system(size: 11, weight: .bold)).foregroundStyle(Band.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(unit.map { $0.name.isEmpty ? "Exercise" : $0.name }.joined(separator: " + "))
                    .font(.system(size: 14, weight: .bold)).lineLimit(1)
                Text("Superset · \(done)/\(total) sets").font(.system(size: 10)).foregroundStyle(Band.label)
            }
            Spacer()
            if total > 0 && done == total {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Band.success).font(.system(size: 13))
            }
        }
    }

    private func exerciseRow(_ ex: LoggedExercise) -> some View {
        let done = ex.sets.filter { $0.logged }.count
        return HStack(spacing: 6) {
            if ex.supersetId != nil {
                Image(systemName: "link").font(.system(size: 10, weight: .bold)).foregroundStyle(Band.accent)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(ex.name.isEmpty ? "Exercise" : ex.name)
                    .font(.system(size: 14, weight: .bold)).lineLimit(1).strikethrough(ex.skipped)
                Text(ex.skipped ? "Skipped" : "\(done)/\(ex.sets.count) sets")
                    .font(.system(size: 10)).foregroundStyle(Band.label)
            }
            Spacer()
            if ex.skipped {
                Image(systemName: "forward.fill").foregroundStyle(Band.dim).font(.system(size: 12))
            } else if done == ex.sets.count && ex.sets.count > 0 {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Band.success).font(.system(size: 13))
            }
        }
        .opacity(ex.skipped ? 0.5 : 1)
    }

    // Apple-Fitness-style recap: big colored metrics + every exercise we logged, then Done.
    private var savedView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Summary")
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(Band.accent)

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    statCard("Time", timeString(manager.elapsed), "stopwatch.fill")
                    statCard("Cal", "\(Int(manager.ourEnergy))", "flame.fill")
                    statCard("Avg HR", "\(Int(summaryAvgHr))", "heart.fill")
                    if manager.distance > 0 {
                        statCard("Distance", String(format: "%.2f km", manager.distance / 1000), "location.fill")
                    } else {
                        statCard("Sets", "\(store.exercises.reduce(0) { $0 + $1.sets.filter { $0.logged }.count })", "checklist")
                    }
                }

                let logged = store.exercises.filter { !$0.skipped && $0.sets.contains { $0.logged } }
                if !logged.isEmpty {
                    Text("EXERCISES")
                        .font(.system(size: 10, weight: .bold)).foregroundStyle(Band.label)
                        .padding(.top, 4)
                    ForEach(logged) { ex in summaryExercise(ex) }
                }

                Text("Synced to phone")
                    .font(.system(size: 10)).foregroundStyle(Band.label).padding(.top, 2)
                // Big full-width Done bar to finish the recap. Exits the workout (the session is
                // the root now), returning to the tabs.
                Button { store.clear(); session.active = false; session.activeDay = nil } label: {
                    Text("Done").font(.system(size: 18, weight: .heavy)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Band.accent, in: Capsule())
                }
                .buttonStyle(.plain).padding(.top, 6)
            }
            .padding(.horizontal, 6)
        }
        .onAppear(perform: send)
    }

    /// Use the measured session average; fall back to the last reading if it never populated.
    private var summaryAvgHr: Double { manager.avgHeartRate > 0 ? manager.avgHeartRate : manager.heartRate }

    // A soft glass stat tile for the summary grid (Apple Fitness / Adidas recap style).
    private func statCard(_ label: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Image(systemName: icon).font(.system(size: 12)).foregroundStyle(Band.accent)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded)).monospacedDigit()
                .minimumScaleFactor(0.6).lineLimit(1).foregroundStyle(.white)
            Text(label.uppercased()).font(.system(size: 8, weight: .semibold)).foregroundStyle(Band.label).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func summaryExercise(_ ex: LoggedExercise) -> some View {
        let done = ex.sets.filter { $0.logged }
        let best = done.max { setVolume($0) < setVolume($1) }
        return HStack(spacing: 6) {
            if ex.supersetId != nil {
                Image(systemName: "link").font(.system(size: 9, weight: .bold)).foregroundStyle(Band.accent)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(ex.name.isEmpty ? "Exercise" : ex.name)
                    .font(.system(size: 13, weight: .bold)).lineLimit(1)
                Text(summaryDetail(count: done.count, best: best))
                    .font(.system(size: 10)).foregroundStyle(Band.label)
            }
            Spacer()
        }
        .padding(.vertical, 1)
    }

    private func setVolume(_ s: LoggedSet) -> Double { s.weight * Double(max(s.reps, 0)) }

    private func summaryDetail(count: Int, best: LoggedSet?) -> String {
        var s = "\(count) set\(count == 1 ? "" : "s")"
        if let b = best {
            let reps = b.reps < 0 ? "F" : "\(b.reps)"
            if b.bodyweight || b.weight == 0 {
                s += " · best \(reps) reps"
            } else {
                s += String(format: " · best %g×%@", b.weight, reps)
            }
        }
        return s
    }

    private func send() {
        let now = Date().timeIntervalSince1970
        let payload = WorkoutPayload(
            category: day.category,
            planId: day.id,
            startDate: now - manager.elapsed,
            endDate: now,
            durationSec: manager.elapsed,
            activeEnergyKcal: manager.ourEnergy,
            distanceMeters: manager.distance,
            avgHr: summaryAvgHr,
            exercises: store.cleaned()
        )
        connectivity.sendWorkout(payload)
    }

    private func timeString(_ t: TimeInterval) -> String {
        let s = Int(t); return String(format: "%02d:%02d", s / 60, s % 60)
    }
}

/// Big 3-2-1 "get ready" countdown shown before a logged day begins.
struct CountdownView: View {
    let count: Int
    var body: some View {
        VStack(spacing: 4) {
            Text("GET READY").font(.system(size: 12, weight: .bold)).foregroundStyle(Band.label)
            Text("\(count)")
                .font(.system(size: 80, weight: .heavy, design: .rounded))
                .foregroundStyle(Band.accent)
                .contentTransition(.numericText(countsDown: true))
                .animation(.snappy, value: count)
        }
    }
}

/// Full-screen rest countdown shown after an RPE is logged. Auto-dismisses at 0 because it
/// is bound to `store.showRest`, which the timer flips off (with a haptic) when it ends.
struct RestView: View {
    @EnvironmentObject var store: SetLogStore

    var body: some View {
        // Just the number — green like a rest, red in the final 10s. (No ring.)
        let color = store.restRemaining <= 10 ? Band.stop : Band.success
        return VStack(spacing: 10) {
            Text("REST").font(.system(size: 13, weight: .bold)).foregroundStyle(Band.label)
            Text("\(store.restRemaining)")
                .font(.system(size: 56, weight: .heavy, design: .rounded)).monospacedDigit()
                .foregroundStyle(color)
            HStack(spacing: 8) {
                Button("−15") { store.adjustRest(-15) }.buttonStyle(.bordered)
                Button("+15") { store.adjustRest(15) }.buttonStyle(.bordered)
            }
            Button("Skip") { store.skipRest() }
                .font(.system(size: 13, weight: .semibold))
                .buttonStyle(.borderedProminent).tint(Band.success)
        }
        .padding()
    }
}
