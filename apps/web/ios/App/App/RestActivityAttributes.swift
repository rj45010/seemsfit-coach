import Foundation
import ActivityKit

/// Shared between the App target (which starts/updates/ends the activity) and the
/// Widget Extension (which renders it). The countdown end time lives in ContentState
/// so the Dynamic Island / Lock Screen can tick down on their own via Text(timerInterval:).
struct RestActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endsAt: Date
    }

    var title: String = "Rest"
}
