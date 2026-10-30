import WidgetKit
import SwiftUI
import ActivityKit

private let accent = Color(red: 0.96, green: 0.78, blue: 0.36)

/// The live MM:SS countdown. `.contentTransition(.numericText())` smooths the jump when
/// the ±15s buttons change the end time.
private func countdown(to endsAt: Date, size: CGFloat) -> some View {
    Text(timerInterval: Date.now...endsAt, countsDown: true)
        .font(.system(size: size, weight: .bold, design: .rounded))
        .monospacedDigit()
        .lineLimit(1)
        .contentTransition(.numericText())
}

/// ±15s and Stop controls (iOS 17+ interactive Live Activity buttons). All three share a
/// fixed label size so they render identically; Stop uses the standard `stop.fill` glyph.
/// Tapping runs the matching intent in the app process, so they work on the locked screen.
@available(iOS 17.0, *)
private struct RestControls: View {
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: AdjustRestIntent(delta: -15)) {
                Text("−15").frame(width: 42, height: 20)
            }
            .tint(accent)
            Button(intent: AdjustRestIntent(delta: 15)) {
                Text("+15").frame(width: 42, height: 20)
            }
            .tint(accent)
            Button(intent: EndRestIntent()) {
                Image(systemName: "stop.fill").frame(width: 42, height: 20)
            }
            .tint(.red)
        }
        .font(.subheadline.weight(.bold))
        .monospacedDigit()
        .buttonStyle(.bordered)
    }
}

/// Lock Screen + Dynamic Island UI for the rest timer. Uses Text(timerInterval:) so the
/// countdown ticks on its own with no push updates — the app only sets the end time.
struct RestLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            // Lock Screen / banner — everything inline.
            HStack(spacing: 10) {
                Image(systemName: "timer")
                    .font(.title3.bold())
                    .foregroundStyle(accent)
                countdown(to: context.state.endsAt, size: 24)
                Spacer(minLength: 4)
                if #available(iOS 17.0, *) {
                    RestControls().controlSize(.small)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .activityBackgroundTint(Color.black.opacity(0.25))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Rest", systemImage: "timer")
                        .font(.subheadline.bold())
                        .foregroundStyle(accent)
                        .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(to: context.state.endsAt, size: 22)
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if #available(iOS 17.0, *) {
                        RestControls()
                            .padding(.top, 4)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                countdown(to: context.state.endsAt, size: 14)
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }
}

@main
struct SeemsFitRestWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestLiveActivity()
    }
}
