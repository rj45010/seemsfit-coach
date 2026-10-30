import SwiftUI

/// Tracks the in-progress logged workout. `activeDay` drives a full-screen cover presented
/// ABOVE the tabs, so a live session can't be swiped away to another tab; `active` guards the
/// foreground reset so reopening the app doesn't tear the session down.
@MainActor final class WorkoutSessionState: ObservableObject {
    @Published var active = false
    @Published var activeDay: WatchPlan?
}

/// Entry point for the SeemsFit watchOS app. Owns the long-lived managers and injects them
/// (at the root, so pushed screens inherit them reliably) into the view tree.
@main
struct SeemsFitWatchApp: App {
    @StateObject private var health = HealthManager()
    @StateObject private var connectivity = ConnectivityManager()
    @StateObject private var session = WorkoutSessionState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(health)
                .environmentObject(connectivity)
                .environmentObject(session)
                .task { await health.requestAuthorization() }  // HealthKit permission, first launch
        }
    }
}

/// Top-level navigation: two swipeable tabs (page dots) — Today (sessions scheduled for the
/// current weekday) and Plans (browse every program). Returning to the app jumps back to the
/// tabs unless a workout is in progress.
struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var session: WorkoutSessionState
    @EnvironmentObject private var health: HealthManager
    @EnvironmentObject private var connectivity: ConnectivityManager
    @State private var navID = UUID()

    var body: some View {
        Group {
            // While a workout is live we REPLACE the tabs with the session (its own full-screen
            // stack) — no tab swipe, no system cover X/tint, full safe area. Exiting the workout
            // sets activeDay back to nil and the tabs return.
            if let day = session.activeDay {
                NavigationStack { DayLogView(day: day, healthStore: health.store) }
            } else {
                TabView {
                    NavigationStack { TodayView() }
                    NavigationStack { ProgramsListView() }
                }
                .tabViewStyle(.page)
            }
        }
        .id(navID)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && !session.active { navID = UUID() }  // reset to the tabs
        }
    }
}
