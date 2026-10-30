import SwiftUI
import WatchKit

/// The "set" screen: three rows (Weight / Reps / RPE), each opening a full-screen big-number
/// editor you scrub with the Digital Crown OR the ± buttons. Setting an RPE finalizes the set
/// and starts the rest timer automatically (RPE is the last thing you log); the explicit Done
/// records weight+reps with no rest.
struct SetEditorView: View {
    @ObservedObject var store: SetLogStore
    let exerciseId: UUID
    @State var set: LoggedSet
    @Environment(\.dismiss) private var dismiss
    @State private var showRPE = false
    @State private var finalizeAfterRPE = false

    var body: some View {
        List {
            Section {
                NavigationLink { WeightPicker(weight: $set.weight, bodyweight: $set.bodyweight) } label: {
                    row("Weight", weightLabel)
                }
                .rowFill()
                NavigationLink { RepsPicker(reps: $set.reps, rpe: $set.rpe) } label: {
                    row("Reps", repsLabel)
                }
                .rowFill()
                // Picking an RPE logs the set and starts rest. We pop the RPE screen first, then
                // finalize from THIS view's context, so we land on the exercise list (not out of
                // the whole workout).
                Button { showRPE = true } label: { row("RPE", rpeLabel) }
                    .buttonStyle(.plain).rowFill()
            }

            Section {
                Button(action: finalize) {
                    Label("Done", systemImage: "checkmark")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .rowFill(Band.accent)
            }
        }
        .navigationTitle("Set")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showRPE) {
            RPEPicker(rpe: $set.rpe, onCommit: { finalizeAfterRPE = true; showRPE = false })
        }
        .onChange(of: showRPE) { _, shown in
            if !shown && finalizeAfterRPE { finalizeAfterRPE = false; finalize() }
        }
    }

    /// Save the set; start rest only if an RPE was recorded. A light tap confirms the log.
    private func finalize() {
        set.logged = true
        store.updateSet(exerciseId, set, startRest: set.rpe != nil)
        WKInterfaceDevice.current().play(.click)
        dismiss()
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.system(size: 14, weight: .semibold))
            Spacer()
            Text(value).font(.system(size: 16, weight: .bold)).foregroundStyle(Band.accent)
        }
        .contentShape(Rectangle())   // make the whole row tappable, not just the text
    }

    private var weightLabel: String { self.set.bodyweight ? "BW" : weightText(self.set.weight) }
    private var repsLabel: String { self.set.reps == -1 ? "Failure" : "\(self.set.reps)" }
    private var rpeLabel: String { self.set.rpe.map(rpeText) ?? "-" }
}

private func weightText(_ w: Double) -> String { w == floor(w) ? "\(Int(w)) kg" : String(format: "%.1f kg", w) }
private func rpeText(_ v: Double) -> String { v == floor(v) ? "\(Int(v))" : String(format: "%.1f", v) }

// MARK: Full-screen Crown + touch editors

/// Weight: two fields — whole kg (left, ±1) and a tenths digit (right, 0…9) — so any load is
/// reachable (e.g. 141 or 142.5). Tap a field to focus it, then scrub with the Crown; the ±
/// buttons nudge the focused field. A Bodyweight pill swaps in "BW".
struct WeightPicker: View {
    @Binding var weight: Double
    @Binding var bodyweight: Bool
    @Environment(\.dismiss) private var dismiss

    @State private var whole: Double = 0   // kg
    @State private var frac: Double = 0    // tenths, 0…9
    @FocusState private var focus: Field?
    private enum Field { case whole, frac }

    var body: some View {
        VStack(spacing: 6) {
            Text("WEIGHT").font(.system(size: 10, weight: .semibold)).foregroundStyle(Band.label)
            if bodyweight {
                bigValue("BW")
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    digit("\(Int(whole))", focused: focus == .whole)
                        .focusable(true)
                        .focused($focus, equals: .whole)
                        .digitalCrownRotation($whole, from: 0, through: 400, by: 1,
                                              sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
                        .onTapGesture { focus = .whole }
                    Text(".").font(.system(size: 30, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                    digit("\(Int(frac))", focused: focus == .frac)
                        .focusable(true)
                        .focused($focus, equals: .frac)
                        .digitalCrownRotation($frac, from: 0, through: 9, by: 1,
                                              sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
                        .onTapGesture { focus = .frac }
                    Text("kg").font(.system(size: 14, weight: .bold)).foregroundStyle(Band.label)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            HStack(spacing: 8) {
                stepCircle("minus") { adjust(-1) }
                togglePill("BW", bodyweight) { bodyweight.toggle() }
                stepCircle("plus") { adjust(1) }
            }
            doneButton { dismiss() }
        }
        .padding(.horizontal, 6)
        .navigationTitle("Weight").navigationBarTitleDisplayMode(.inline)
        .onAppear { load(); if focus == nil { focus = .whole } }
        .onChange(of: whole) { _, _ in weight = whole + frac / 10 }
        .onChange(of: frac) { _, _ in weight = whole + frac / 10 }
    }

    private func digit(_ s: String, focused: Bool) -> some View {
        Text(s)
            .font(.system(size: 46, weight: .heavy, design: .rounded)).monospacedDigit()
            .foregroundStyle(focused ? Band.accent : .white)
    }

    private func adjust(_ d: Int) {
        if focus == .frac { frac = min(9, max(0, frac + Double(d))) }
        else { whole = min(400, max(0, whole + Double(d))) }
    }

    private func load() {
        whole = weight.rounded(.down)
        frac = min(9, max(0, ((weight - whole) * 10).rounded()))
    }
}

/// Reps: big number, Crown / ± (1 rep steps), plus a "Failure" pill that records reps = F and
/// RPE = 10 (a true all-out set), mirroring the phone.
struct RepsPicker: View {
    @Binding var reps: Int
    @Binding var rpe: Double?
    @Environment(\.dismiss) private var dismiss

    private var failure: Bool { reps == -1 }
    private var repsD: Binding<Double> {
        Binding(get: { Double(min(50, max(1, reps))) },
                set: { reps = min(50, max(1, Int($0.rounded()))) })
    }

    var body: some View {
        VStack(spacing: 6) {
            Text("REPS").font(.system(size: 10, weight: .semibold)).foregroundStyle(Band.label)
            bigValue(failure ? "F" : "\(reps)")
                .focusable(!failure)
                .digitalCrownRotation(repsD, from: 1, through: 50, by: 1,
                                      sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
            HStack(spacing: 8) {
                stepCircle("minus") { if !failure { reps = max(1, reps - 1) } }
                togglePill("Failure", failure) { if failure { reps = 8 } else { reps = -1; rpe = 10 } }
                stepCircle("plus") { if !failure { reps = min(50, reps + 1) } }
            }
            doneButton { dismiss() }
        }
        .padding(.horizontal, 6)
        .navigationTitle("Reps").navigationBarTitleDisplayMode(.inline)
    }
}

/// RPE: big number stepped through discrete options (None, 6, 6.5 … 10) with the Crown / ±,
/// plus a "None" pill. Using an option index keeps the steps exact (no 6.1, 6.2 drift). Done
/// calls `onCommit`, which finalizes the set (single) or advances the superset round.
struct RPEPicker: View {
    @Binding var rpe: Double?
    var onCommit: () -> Void
    private let options: [Double?] = [nil, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
    @State private var idx: Double = 0

    private var current: Double? { options[Int(idx.rounded())] }

    var body: some View {
        VStack(spacing: 6) {
            Text("RPE").font(.system(size: 10, weight: .semibold)).foregroundStyle(Band.label)
            bigValue(current == nil ? "None" : rpeText(current!), accent: current != nil)
                .focusable()
                .digitalCrownRotation($idx, from: 0, through: Double(options.count - 1), by: 1,
                                      sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                .onChange(of: idx) { _, v in rpe = options[Int(v.rounded())] }
            HStack(spacing: 8) {
                stepCircle("minus") { idx = max(0, (idx - 1).rounded()) }
                togglePill("None", current == nil) { idx = 0 }
                stepCircle("plus") { idx = min(Double(options.count - 1), (idx + 1).rounded()) }
            }
            doneButton(onCommit)
        }
        .padding(.horizontal, 6)
        .navigationTitle("RPE").navigationBarTitleDisplayMode(.inline)
        .onAppear { idx = Double(options.firstIndex(where: { $0 == rpe }) ?? 0) }
    }
}

// MARK: Shared picker pieces

/// The big accent value that fills the screen (the Crown/touch target).
func bigValue(_ text: String, accent: Bool = true) -> some View {
    Text(text)
        .font(.system(size: 52, weight: .heavy, design: .rounded)).monospacedDigit()
        .minimumScaleFactor(0.5).lineLimit(1)
        .foregroundStyle(accent ? Band.accent : .white)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
}

func stepCircle(_ icon: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Image(systemName: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
            .frame(width: 40, height: 34).background(Band.tonal, in: Capsule())
    }
    .buttonStyle(.plain)
}

func togglePill(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(on ? .black : .white)
            .frame(maxWidth: .infinity).frame(height: 34)
            .background(on ? Band.accent : Band.tonal, in: Capsule())
    }
    .buttonStyle(.plain)
}

func doneButton(_ action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Label("Done", systemImage: "checkmark")
            .font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(Band.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
    .buttonStyle(.plain)
}
