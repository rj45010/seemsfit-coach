import Foundation
import SwiftUI
import WatchKit

/// Holds the strength log for the in-progress workout and the rest timer. Persists to
/// UserDefaults after every change so an accidental exit (or low battery) never loses
/// entered sets-the workout can be recovered and re-sent.
@MainActor
final class SetLogStore: ObservableObject {
    @Published var exercises: [LoggedExercise] = [LoggedExercise(name: "")]

    // Rest timer, started when an RPE is committed (mirrors the phone's 2-minute default).
    @Published var restRemaining: Int = 0
    @Published var restTotal: Int = 0       // the rest's full length, for the depleting ring
    @Published var showRest: Bool = false   // drives the full-screen rest cover
    private var restTimer: Timer?
    private var restEndsAt: Date?           // wall-clock end → accurate across screen-off
    private var restWarned = false          // fired the "10s left" haptic yet?
    static let defaultRest = 120

    private let key = "seemsfit.activeLog"

    init() { restore() }

    /// Seed the logger from a phone plan: one card per exercise, each pre-filled with the
    /// planned number of sets and last time's weight/reps (so logging is a couple of crown
    /// turns). Does NOT restore a previous session-a plan starts fresh.
    init(plan: WatchPlan) {
        var groupIds: [String: Int] = [:]   // plan's string superset keys → stable Int groups
        var nextGroup = 1
        exercises = plan.exercises.map { pe in
            let plannedReps = Int(pe.reps.prefix(while: { $0.isNumber })) ?? 0
            let count = max(pe.sets, pe.loggedSets.count, 1)
            let sets = (0..<count).map { i -> LoggedSet in
                if i < pe.loggedSets.count {
                    let ls = pe.loggedSets[i]
                    return LoggedSet(weight: ls.weight,
                                     reps: ls.reps != 0 ? ls.reps : plannedReps,
                                     bodyweight: ls.bodyweight)
                }
                let seed = pe.loggedSets.last
                return LoggedSet(weight: seed?.weight ?? 0,
                                 reps: plannedReps,
                                 bodyweight: seed?.bodyweight ?? false)
            }
            var ex = LoggedExercise(name: pe.name, sets: sets)
            if let sid = pe.supersetId {
                if groupIds[sid] == nil { groupIds[sid] = nextGroup; nextGroup += 1 }
                ex.supersetId = groupIds[sid]
            }
            return ex
        }
        if exercises.isEmpty { exercises = [LoggedExercise(name: "")] }
        persist()
    }

    // MARK: Exercises / sets
    func addExercise() {
        exercises.append(LoggedExercise(name: ""))
        persist()
    }

    func removeExercise(_ id: UUID) {
        guard exercises.count > 1 else { return }
        exercises.removeAll { $0.id == id }
        persist()
    }

    func rename(_ id: UUID, _ name: String) {
        guard let i = exercises.firstIndex(where: { $0.id == id }) else { return }
        exercises[i].name = name
        persist()
    }

    /// Skip / unskip an exercise-skipped ones are dropped from the workout sent to the phone.
    func toggleSkip(_ id: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == id }) else { return }
        exercises[i].skipped.toggle()
        persist()
    }

    /// Superset any two exercises in the day-they get a shared group id (joining an
    /// existing group if either is already in one).
    func linkSuperset(_ a: UUID, _ b: UUID) {
        guard let ia = exercises.firstIndex(where: { $0.id == a }),
              let ib = exercises.firstIndex(where: { $0.id == b }), ia != ib else { return }
        let group = exercises[ia].supersetId ?? exercises[ib].supersetId
            ?? ((exercises.compactMap { $0.supersetId }.max() ?? 0) + 1)
        exercises[ia].supersetId = group
        exercises[ib].supersetId = group
        persist()
    }

    /// Remove an exercise from its superset group.
    func clearSuperset(_ id: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == id }) else { return }
        exercises[i].supersetId = nil
        persist()
    }

    /// Link / unlink an exercise into a superset with the one above it (quick-workout logger).
    func toggleSuperset(_ id: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == id }), i > 0 else { return }
        if exercises[i].supersetId != nil {
            exercises[i].supersetId = nil
        } else {
            let prev = exercises[i - 1]
            exercises[i].supersetId = prev.supersetId ?? i // group key = first exercise index
            if exercises[i - 1].supersetId == nil { exercises[i - 1].supersetId = i }
        }
        persist()
    }

    func addSet(to exId: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == exId }) else { return }
        // Seed from the previous set so logging the next is a couple of crown turns.
        let seed = exercises[i].sets.last ?? LoggedSet()
        exercises[i].sets.append(LoggedSet(weight: seed.weight, reps: seed.reps, bodyweight: seed.bodyweight))
        persist()
    }

    /// A drop set: same exercise, lighter load, marked so the phone shows it as a drop.
    func addDropSet(to exId: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == exId }) else { return }
        let seed = exercises[i].sets.last ?? LoggedSet()
        let lighter = seed.bodyweight ? seed.weight : max(0, seed.weight - 2.5)
        exercises[i].sets.append(LoggedSet(weight: lighter, reps: seed.reps, isDrop: true, bodyweight: seed.bodyweight))
        persist()
    }

    func removeSet(_ exId: UUID, _ setId: UUID) {
        guard let i = exercises.firstIndex(where: { $0.id == exId }) else { return }
        exercises[i].sets.removeAll { $0.id == setId }
        persist()
    }

    func updateSet(_ exId: UUID, _ set: LoggedSet, startRest: Bool) {
        guard let i = exercises.firstIndex(where: { $0.id == exId }),
              let j = exercises[i].sets.firstIndex(where: { $0.id == set.id }) else { return }
        exercises[i].sets[j] = set
        persist()
        if startRest && set.rpe != nil { beginRest(Self.defaultRest) }
    }

    var totalSets: Int { exercises.reduce(0) { $0 + $1.sets.count } }

    /// Exercises that actually have logged content, ready to send.
    func cleaned() -> [LoggedExercise] {
        exercises
            .map { ex -> LoggedExercise in
                var e = ex
                e.name = ex.name.trimmingCharacters(in: .whitespaces)
                e.sets = ex.sets.filter { $0.reps != 0 || $0.weight != 0 || $0.bodyweight }
                return e
            }
            .filter { !$0.skipped && !$0.name.isEmpty && !$0.sets.isEmpty }
    }

    // MARK: Rest timer (full-screen, with haptics: a buzz at 10s left, a buzz + close at 0).
    // Remaining is derived from a wall-clock end time, so it stays correct even if the watch
    // screen sleeps and the timer is throttled-the active workout session keeps us running.
    func beginRest(_ seconds: Int) {
        restEndsAt = Date().addingTimeInterval(TimeInterval(seconds))
        restWarned = false
        restRemaining = seconds
        restTotal = seconds
        showRest = true
        startRestTimer()
    }

    private func startRestTimer() {
        restTimer?.invalidate()
        restTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickRest() }
        }
    }

    private func tickRest() {
        guard let end = restEndsAt else { return }
        let remaining = max(0, Int(end.timeIntervalSinceNow.rounded(.up)))
        if remaining != restRemaining { restRemaining = remaining }
        if remaining <= 10 && remaining > 0 && !restWarned {
            restWarned = true
            WKInterfaceDevice.current().play(.click)   // gentle "10s left" tap (not the notification buzz)
        }
        if remaining == 0 {
            WKInterfaceDevice.current().play(.stop)            // done - buzz and close
            restTimer?.invalidate()
            restEndsAt = nil
            showRest = false
        }
    }

    /// Lengthen/shorten the running rest (the ±15s controls), never below zero.
    func adjustRest(_ delta: Int) {
        guard let end = restEndsAt else { return }
        let newEnd = end.addingTimeInterval(TimeInterval(delta))
        if newEnd.timeIntervalSinceNow <= 0 { skipRest(); return }
        restEndsAt = newEnd
        restRemaining = max(0, Int(newEnd.timeIntervalSinceNow.rounded(.up)))
        restTotal = max(restTotal, restRemaining)       // keep the ring proportional if extended
        if restRemaining > 10 { restWarned = false }   // re-arm the 10s warning if extended
    }

    func skipRest() {
        restRemaining = 0
        showRest = false
        restEndsAt = nil
        restTimer?.invalidate()
    }

    // MARK: Persistence
    func clear() {
        exercises = [LoggedExercise(name: "")]
        UserDefaults.standard.removeObject(forKey: key)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(exercises) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    private func restore() {
        guard let data = UserDefaults.standard.data(forKey: key),
              let saved = try? JSONDecoder().decode([LoggedExercise].self, from: data),
              !saved.isEmpty else { return }
        exercises = saved
    }
}
