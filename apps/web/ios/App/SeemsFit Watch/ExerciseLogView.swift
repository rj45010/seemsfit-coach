import SwiftUI
import WatchKit

/// One exercise during a logged day: its sets as tappable rows (→ the set editor), plus
/// Add set / Add drop set / Superset controls. Each row shows the logged load and a tick
/// once it has data.
struct ExerciseLogView: View {
    @ObservedObject var store: SetLogStore
    let exerciseId: UUID
    @Environment(\.dismiss) private var dismiss

    private var exercise: LoggedExercise? { store.exercises.first { $0.id == exerciseId } }

    var body: some View {
        List {
            if let ex = exercise {
                Section {
                    ForEach(Array(ex.sets.enumerated()), id: \.element.id) { idx, s in
                        NavigationLink {
                            SetEditorView(store: store, exerciseId: exerciseId, set: s)
                        } label: {
                            HStack(spacing: 6) {
                                Text(s.isDrop ? "↓" : "\(idx + 1)")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(s.isDrop ? Band.accent : Band.label)
                                    .frame(width: 16)
                                Text(summary(s)).font(.system(size: 14, weight: .semibold))
                                Spacer()
                                if logged(s) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Band.success).font(.system(size: 13))
                                }
                            }
                        }
                        .swipeActions {
                            Button(role: .destructive) { store.removeSet(exerciseId, s.id) } label: {
                                Image(systemName: "trash")
                            }
                        }
                        .rowFill()
                    }
                }

                Section {
                    // Primary action = accent; secondary actions = quiet tonal rows.
                    Button { store.addSet(to: exerciseId) } label: {
                        actionLabel("Add set", "plus", .black)
                    }
                    .buttonStyle(.plain).rowFill(Band.accent)

                    Button { store.addDropSet(to: exerciseId) } label: {
                        actionLabel("Add drop set", "arrow.down.to.line", .white)
                    }
                    .buttonStyle(.plain).rowFill(Band.tonal)

                    if ex.supersetId != nil {
                        Button { store.clearSuperset(exerciseId) } label: {
                            actionLabel("Remove superset", "link.badge.plus", .white)
                        }
                        .buttonStyle(.plain).rowFill(Band.tonal)
                    } else {
                        NavigationLink {
                            SupersetPickerView(store: store, exerciseId: exerciseId)
                        } label: {
                            actionLabel("Superset with…", "link", .white)
                        }
                        .rowFill(Band.tonal)
                    }
                }
            }
        }
        .navigationTitle(exercise?.name.isEmpty == false ? exercise!.name : "Exercise")
        .navigationBarTitleDisplayMode(.inline)
        // Forming a superset here turns this exercise into part of a group; pop back to the
        // exercise list so it's logged through the guided superset round flow, not set-by-set.
        .onChange(of: exercise?.supersetId) { _, newValue in
            if newValue != nil { dismiss() }
        }
    }

    private func logged(_ s: LoggedSet) -> Bool { s.logged }

    // Fill the whole row and use a rectangular hit area so a tap anywhere on the colored
    // button registers, not just on the text/icon.
    private func actionLabel(_ title: String, _ icon: String, _ fg: Color) -> some View {
        Label(title, systemImage: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(fg)
            .frame(maxWidth: .infinity, alignment: .center)
            .contentShape(Rectangle())
    }

    private func summary(_ s: LoggedSet) -> String {
        let w = s.bodyweight ? "BW" : (s.weight == floor(s.weight) ? "\(Int(s.weight))" : String(format: "%.1f", s.weight))
        let r = s.reps == -1 ? "F" : "\(s.reps)"
        let rpe = s.rpe.map { " @\($0 == floor($0) ? "\(Int($0))" : String(format: "%.1f", $0))" } ?? ""
        return "\(w) × \(r)\(rpe)"
    }
}

/// Guided superset flow: walks the group one set per exercise, round by round (A1, B1, rest,
/// A2, B2, rest, ...). Logging a set never starts the rest timer mid-round; rest fires only
/// after the last exercise in a round, and a "Next" hint shows what's coming.
struct SupersetRoundView: View {
    @ObservedObject var store: SetLogStore
    let groupIds: [UUID]
    @Environment(\.dismiss) private var dismiss

    @State private var round = 0          // 0-based round (set index)
    @State private var withinRound = 0    // index into this round's active exercises
    @State private var working = LoggedSet()
    @State private var finished = false
    @State private var showRPE = false    // drives the RPE editor so committing it can advance

    // The group's exercises, in plan order, resolved live from the store.
    private var exercises: [LoggedExercise] { groupIds.compactMap { id in store.exercises.first { $0.id == id } } }
    private var maxRounds: Int { exercises.map { $0.sets.count }.max() ?? 0 }

    // Exercises that still have a set at round r (handles uneven set counts).
    private func active(_ r: Int) -> [Int] { exercises.indices.filter { exercises[$0].sets.count > r } }

    var body: some View {
        Group {
            if finished {
                doneView
            } else if let exIdx = currentExerciseIndex {
                editor(exercises[exIdx])
            } else {
                Color.clear.onAppear { finished = true }
            }
        }
        // The current exercise's name is the title, so it stays visible even when the Weight/
        // Reps/RPE rows scroll the header off — you always know which lift you're logging.
        .navigationTitle(currentName)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: loadCurrent)
    }

    private var currentName: String {
        if let i = currentExerciseIndex {
            let n = exercises[i].name
            return n.isEmpty ? "Exercise" : n
        }
        return "Superset"
    }

    private var currentExerciseIndex: Int? {
        let a = active(round)
        guard round < maxRounds, withinRound < a.count else { return nil }
        return a[withinRound]
    }

    private func editor(_ ex: LoggedExercise) -> some View {
        List {
            Section {
                NavigationLink { WeightPicker(weight: $working.weight, bodyweight: $working.bodyweight) } label: {
                    row("Weight", working.bodyweight ? "BW" : weightStr(working.weight))
                }.rowFill()
                NavigationLink { RepsPicker(reps: $working.reps, rpe: $working.rpe) } label: {
                    row("Reps", working.reps == -1 ? "Failure" : "\(working.reps)")
                }.rowFill()
                // Picking an RPE logs this set and advances the round (rest only after the last).
                Button { showRPE = true } label: {
                    row("RPE", working.rpe.map { $0 == floor($0) ? "\(Int($0))" : String(format: "%.1f", $0) } ?? "-")
                }
                .buttonStyle(.plain).rowFill()
            }
            Section {
                Button(action: advance) {
                    Label(isLastInRound ? "Done · start rest" : "Done · next exercise", systemImage: "checkmark")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .center).contentShape(Rectangle())
                }
                .buttonStyle(.plain).rowFill(Band.accent)
            }
        }
        // Round dots + counter in a thin pinned strip (out of the list flow → tiny height), the
        // exercise name is the title, and rest opens by itself — so no bulky header card.
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack(spacing: 5) {
                ForEach(0..<max(maxRounds, 1), id: \.self) { r in
                    Circle()
                        .fill(r < round ? Band.success : (r == round ? Band.accent : Band.tonal))
                        .frame(width: 7, height: 7)
                }
                Spacer()
                Text("Round \(round + 1)/\(maxRounds) · \(withinRound + 1)/\(active(round).count)")
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(Band.label)
            }
            .padding(.horizontal, 12).padding(.top, 2).padding(.bottom, 4)
        }
        .navigationDestination(isPresented: $showRPE) {
            RPEPicker(rpe: $working.rpe, onCommit: { showRPE = false; advance() })
        }
    }

    private var isLastInRound: Bool { withinRound + 1 >= active(round).count }

    private var doneView: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 30)).foregroundStyle(Band.success)
            Text("Superset done").font(.system(size: 16, weight: .bold))
            Button("Back") { dismiss() }.buttonStyle(.borderedProminent).tint(Band.accent)
        }.padding()
    }

    private func loadCurrent() {
        guard let exIdx = currentExerciseIndex else { finished = true; return }
        working = exercises[exIdx].sets[round]
    }

    private func advance() {
        guard let exIdx = currentExerciseIndex else { finished = true; return }
        var s = working; s.logged = true
        store.updateSet(exercises[exIdx].id, s, startRest: false) // never rest mid-round
        WKInterfaceDevice.current().play(.click)                  // set logged

        withinRound += 1
        if withinRound >= active(round).count {
            round += 1
            withinRound = 0
            if round >= maxRounds {
                finished = true
                WKInterfaceDevice.current().play(.success)        // superset complete
                return
            }
            store.beginRest(SetLogStore.defaultRest) // rest only after a full round
        }
        loadCurrent()
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.system(size: 14, weight: .semibold))
            Spacer()
            Text(value).font(.system(size: 16, weight: .bold)).foregroundStyle(Band.accent)
        }
        .contentShape(Rectangle())   // make the whole row tappable, not just the text
    }
    private func weightStr(_ w: Double) -> String { w == floor(w) ? "\(Int(w)) kg" : String(format: "%.1f kg", w) }
}

/// Pick any other exercise in the day to superset the current one with.
struct SupersetPickerView: View {
    @ObservedObject var store: SetLogStore
    let exerciseId: UUID
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(store.exercises.filter { $0.id != exerciseId }) { ex in
            Button {
                store.linkSuperset(exerciseId, ex.id)
                dismiss()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "link").foregroundStyle(Band.accent).font(.system(size: 13))
                    Text(ex.name.isEmpty ? "Exercise" : ex.name).font(.system(size: 14, weight: .semibold))
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .rowFill()
        }
        .navigationTitle("Superset with").navigationBarTitleDisplayMode(.inline)
    }
}
