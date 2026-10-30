import Foundation

/// One logged set. `weight` is kg; `bodyweight` marks a BW set (weight then holds the
/// athlete's bodyweight or 0). `reps` may be a number or "F" (to failure → encoded as -1).
/// Shapes mirror the web app's ExerciseSetEntry so the phone maps them 1:1.
struct LoggedSet: Codable, Identifiable, Equatable {
    var id = UUID()
    var weight: Double = 0
    var reps: Int = 0          // -1 means "F" (to failure)
    var rpe: Double? = nil     // 6…10 in 0.5 steps
    var isDrop: Bool = false
    var bodyweight: Bool = false
    var logged: Bool = false   // true once the user saves it (seeded sets start false)

    private enum CodingKeys: String, CodingKey { case id, weight, reps, rpe, isDrop, bodyweight }
}

/// An exercise with its sets. `supersetId` groups exercises trained back-to-back.
struct LoggedExercise: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String = ""
    var supersetId: Int? = nil
    var sets: [LoggedSet] = []
    var skipped: Bool = false   // swipe-to-skip: excluded from the workout sent to the phone
}

/// The full payload sent to the phone, which writes it to Firestore. Carries both the
/// logged sets and the HealthKit-measured metrics so the phone doesn't need to wait for
/// its own HealthKit sync to have a complete record.
struct WorkoutPayload: Codable {
    var category: String       // matches WorkoutCategory ("Strength", "Running", …)
    var planId: String? = nil  // the plan/day this came from, so the phone can update its seed
    var startDate: Double      // epoch seconds
    var endDate: Double
    var durationSec: Double
    var activeEnergyKcal: Double
    var distanceMeters: Double
    var avgHr: Double
    var exercises: [LoggedExercise]
}
