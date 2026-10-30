import SwiftUI

/// The on-watch strength logger: exercises, each with sets (weight × reps × RPE), plus
/// add-set / add-exercise / superset. A rest banner appears after an RPE is logged.
/// This is the "no phone needed" page of the active workout.
struct WorkoutLogView: View {
    @EnvironmentObject var store: SetLogStore
    /// When provided, a prominent "Log workout" button is shown at the bottom (plan flow).
    var onLog: (() -> Void)? = nil

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach($store.exercises) { $ex in
                    ExerciseCard(exercise: $ex)
                }

                Button(action: store.addExercise) {
                    Label("Add exercise", systemImage: "plus")
                        .font(.system(size: 14, weight: .bold))
                }
                .buttonStyle(.bordered)

                if let onLog {
                    Button(action: onLog) {
                        Label("Log workout", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 15, weight: .bold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Band.good)
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

/// One exercise: editable name, its sets, superset toggle and add-set.
private struct ExerciseCard: View {
    @Binding var exercise: LoggedExercise
    @EnvironmentObject var store: SetLogStore

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Exercise", text: $exercise.name)
                .font(.system(size: 15, weight: .bold))
                .onChange(of: exercise.name) { _, v in store.rename(exercise.id, v) }

            ForEach(Array(exercise.sets.enumerated()), id: \.element.id) { idx, set in
                NavigationLink {
                    SetEditorView(store: store, exerciseId: exercise.id, set: set)
                } label: {
                    HStack(spacing: 4) {
                        Text("\(idx + 1)").font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
                        Spacer()
                        Text(summary(set)).font(.system(size: 13, weight: .semibold))
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { store.removeSet(exercise.id, set.id) } label: { Image(systemName: "trash") }
                }
            }

            HStack {
                Button { store.addSet(to: exercise.id) } label: {
                    Label("Set", systemImage: "plus").font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.bordered)
                Spacer()
                Button { store.toggleSuperset(exercise.id) } label: {
                    Image(systemName: exercise.supersetId != nil ? "link.circle.fill" : "link")
                        .foregroundStyle(exercise.supersetId != nil ? Band.good : .secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(8)
        .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private func summary(_ s: LoggedSet) -> String {
        let w = s.bodyweight ? "BW" : (s.weight == floor(s.weight) ? "\(Int(s.weight))" : String(format: "%.1f", s.weight))
        let r = s.reps == -1 ? "F" : "\(s.reps)"
        let rpe = s.rpe.map { " @\($0 == floor($0) ? "\(Int($0))" : String(format: "%.1f", $0))" } ?? ""
        return "\(w) × \(r)\(rpe)"
    }
}
