import AppIntents
import ActivityKit
import Foundation

/// Live Activity button action: shift the running rest timer by ±seconds straight from
/// the Lock Screen / Dynamic Island. As a LiveActivityIntent it runs in the app's
/// process, so it works while the phone is locked and the app is backgrounded.
///
/// Shared between the App target (which performs it) and the widget target (which builds
/// the Button referencing it) — tick both in Target Membership.
@available(iOS 17.0, *)
struct AdjustRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Adjust Rest Timer"

    @Parameter(title: "Seconds")
    var delta: Int

    init() {}
    init(delta: Int) { self.delta = delta }

    func perform() async throws -> some IntentResult {
        for activity in Activity<RestActivityAttributes>.activities {
            // Never let -15 push the end time into the past.
            let newEnds = max(Date(), activity.content.state.endsAt.addingTimeInterval(TimeInterval(delta)))
            let state = RestActivityAttributes.ContentState(endsAt: newEnds)
            await activity.update(ActivityContent(state: state, staleDate: newEnds))
        }
        return .result()
    }
}

/// Live Activity button action: skip/stop the rest timer from the Lock Screen or
/// Dynamic Island. Ends the activity immediately; the web timer notices it's gone on
/// the next foreground and clears the in-app countdown too.
@available(iOS 17.0, *)
struct EndRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Rest Timer"

    init() {}

    func perform() async throws -> some IntentResult {
        for activity in Activity<RestActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}
