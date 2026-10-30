import SwiftUI

/// Theme. The app uses ONE accent (electric blue); green means success only and red means
/// stop/over only. The recovery/strain/sleep rings keep their own data-viz ramp (good/amber/
/// bad) since there color encodes a value, not UI emphasis.
enum Band {
    static let good = Color(red: 0.18, green: 0.90, blue: 0.46)   // electric green (data-viz / success)
    static let amber = Color(red: 1.00, green: 0.62, blue: 0.04)  // data-viz only
    static let bad = Color(red: 1.00, green: 0.27, blue: 0.36)    // hot red (data-viz / stop)
    static let energy = Color(red: 0.184, green: 0.725, blue: 0.541) // brand emerald/teal (matches phone accent)
    static let dim = Color.gray.opacity(0.45)
    static let row = Color.white.opacity(0.12)                    // default list-row fill

    // Semantic roles for the workout/logging UI — use these, not the raw colors above.
    static let accent = energy                 // the single UI accent: active value, primary button, progress
    static let success = good                  // completion only (a logged check, "done")
    static let stop = bad                      // stop / destructive / over-budget only
    static let label = Color.white.opacity(0.55) // muted caps labels
    static let tonal = Color.white.opacity(0.14) // secondary (tonal) button fill
}

extension View {
    /// Uniform rounded row background-content rows and colored action rows share the exact
    /// same radius / inset / padding, so only the fill color distinguishes the buttons.
    func rowFill(_ color: Color = Band.row) -> some View {
        listRowBackground(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(color))
    }
}

// MARK: Shared building blocks (one accent, hero number + muted caps label)

/// A hero stat: tiny muted ALL-CAPS label above a big rounded number. `accent` highlights the
/// active/primary value (blue); everything else stays white so only what matters is colored.
struct StatBlock: View {
    let value: String
    let label: String
    var size: CGFloat = 24
    var accent: Bool = false
    var align: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: align, spacing: 0) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold)).foregroundStyle(Band.label)
            Text(value)
                .font(.system(size: size, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundStyle(accent ? Band.accent : .white)
        }
    }
}

/// Capsule action button. `.filled` = accent (primary), `.tonal` = quiet grey (secondary),
/// `.stop` = red (destructive). One consistent radius/height across the app.
struct CapsuleButton: View {
    enum Style { case filled, tonal, stop }
    let title: String
    var systemImage: String? = nil
    var style: Style = .filled
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let s = systemImage { Image(systemName: s) }
                Text(title)
            }
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).padding(.vertical, 9)
            .background(fill, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var fill: Color {
        switch style {
        case .filled: return Band.accent
        case .tonal: return Band.tonal
        case .stop: return Band.stop
        }
    }
}

// MARK: Heart-rate zones (coach-style intensity read)

/// Five training zones from the user's max HR. `HealthManager` sets `maxHR` from the Health-app
/// date of birth (220 − age) at launch; the 190 default is only a fallback if DOB isn't shared.
enum HRZone {
    static var maxHR: Double = 190

    /// 1…5 for a live BPM, or 0 before any reading (nothing to show).
    static func index(_ bpm: Double) -> Int {
        guard bpm > 40 else { return 0 }
        switch bpm / maxHR {
        case ..<0.60: return 1   // easy
        case ..<0.70: return 2   // fat burn
        case ..<0.80: return 3   // aerobic
        case ..<0.90: return 4   // threshold
        default:      return 5   // max
        }
    }

    /// Blue (easy) → green → yellow → orange → red (max). Cool-to-hot reads as effort.
    static func color(_ zone: Int) -> Color {
        switch zone {
        case 1: return Band.energy
        case 2: return Band.good
        case 3: return Color(red: 1.00, green: 0.84, blue: 0.20)
        case 4: return Band.amber
        case 5: return Band.bad
        default: return Band.dim
        }
    }

    static func label(_ zone: Int) -> String { zone == 0 ? "--" : "Z\(zone)" }
}

/// Five zone segments, each in its own colour (Z1 blue → Z5 red). The zone you're currently
/// in expands and shows its label; the others stay collapsed but keep their colour so the
/// whole intensity spectrum is visible at a glance.
struct HRZoneBar: View {
    let bpm: Double
    var body: some View {
        let zone = HRZone.index(bpm)
        HStack(spacing: 3) {
            ForEach(1...5, id: \.self) { i in
                let on = i == zone
                ZStack {
                    Capsule().fill(HRZone.color(i).opacity(on ? 1 : 0.32))
                    if on {
                        Text("Z\(i)").font(.system(size: 9, weight: .heavy)).foregroundStyle(.black)
                    }
                }
                .frame(width: on ? 32 : 9, height: 9)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: zone)
    }
}

/// A faint radial glow behind a screen so the black background gains depth. `tint` shifts with
/// context (e.g. the live HR zone). Kept low-opacity so foreground text stays fully legible.
struct ScreenBackground: View {
    var tint: Color = Band.accent
    var body: some View {
        RadialGradient(
            colors: [tint.opacity(0.30), .clear],
            center: .center, startRadius: 2, endRadius: 140
        )
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .animation(.easeOut(duration: 0.4), value: tint)
    }
}

/// A single progress ring with a value label, used for Recovery / Strain / Sleep.
struct RingView: View {
    var progress: Double   // 0…1
    var color: Color
    var label: String
    var value: String

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: max(0.001, min(1, progress)))
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(value)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .frame(width: 56, height: 56)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
        }
    }
}
