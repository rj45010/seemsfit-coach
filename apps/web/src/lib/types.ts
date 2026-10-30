import type { Timestamp } from 'firebase/firestore';

/** A value that may arrive as a Firestore Timestamp, JS Date, or ISO string. */
export type TimeLike = Timestamp | Date | string | number | null | undefined;

export type WorkoutCategory =
  | 'Strength'
  | 'Running'
  | 'Cycling'
  | 'Walking'
  | 'Hiking'
  | 'Swimming'
  | 'HIIT'
  | 'Yoga'
  | 'Core'
  | 'Other';

export interface ExerciseSetEntry {
  weight: string | number; // resolved kg saved to DB (bodyweight sets store the actual bodyweight)
  reps: number | 'F';
  isDrop: boolean;
  rpe?: number; // 1-10 perceived exertion (RIR = 10 - RPE); optional
  bodyweight?: boolean; // true = this was a bodyweight set (UI shows "BW", weight holds the kg)
}

export interface ExerciseSets {
  name: string;
  supersetId: string | null;
  sets: ExerciseSetEntry[];
}

export interface Workout {
  id: string;
  title?: string;
  category: WorkoutCategory;
  duration?: number; // minutes
  distance?: number; // km
  pace?: string;
  paceLabel?: string;
  calories?: number;
  avgHr?: number; // from watch import / merge
  maxHr?: number;
  notes?: string;
  isManual?: boolean;
  customDate?: string;
  createdAt?: TimeLike;
  exerciseSets?: ExerciseSets[];
  route?: Array<{ lat: number; lng: number }>;
  currentSpeedKmph?: number;
  cadence?: number;
  currentSteps?: number;
  activity?: 'Run' | 'Cycle' | 'Hike' | 'Walk';
  // --- Universal activity (P3): any sport, perceived effort, structured efforts ---
  sport?: string; // freeform: "Cricket", "Padel", "Bouldering"
  effort?: number; // RPE 1-10
  feel?: 'great' | 'good' | 'ok' | 'rough';
  format?: ActivityFormat;
  segments?: Segment[]; // intervals / HYROX stations / circuit rounds
  source?: 'manual' | 'jarvis' | 'appleHealth' | 'hae' | 'migrated' | 'watch' | 'plan';
  hkUuid?: string; // UUID of the HKWorkout we wrote to Apple Health (for two-way delete)
  sourcePlanId?: string; // the plan this session was logged from (for pre-fill revert on delete)
  watchMerged?: boolean; // watch session metrics (HR/kcal/duration) were merged into this phone log
}

export type ActivityFormat = 'standard' | 'intervals' | 'hyrox' | 'circuit' | 'emom' | 'amrap';

export interface Segment {
  order: number;
  kind: 'run' | 'station' | 'rest';
  label?: string; // "400m", "Sled Push", "Ski Erg"
  distanceM?: number;
  durationSec?: number;
  reps?: number;
  weightKg?: number;
  pace?: string;
  avgHr?: number;
}

export interface PlanExercise {
  name: string;
  exName: string;
  sets: number;
  reps: number | string;
  done: boolean;
  supersetId: string | null;
  loggedSets?: ExerciseSetEntry[];
}

export type Weekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface Plan {
  id: string;
  title: string;
  day: Weekday;
  category: string;
  duration: number;
  calories?: number;
  exercises: PlanExercise[];
  sourceId: string;
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}

/** A titled, goal-typed group of plan days (gym, HYROX, running block, …). */
export interface Program {
  id: string; // also used as plans[].sourceId
  title: string;
  goalType?: string; // 'strength' | 'hyrox' | 'running' | 'hybrid' | ...
  status: 'active' | 'archived';
  notes?: string;
  /** Temporary program: auto-deleted (with its sessions) once this date passes. YYYY-MM-DD. */
  expiresAt?: string;
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}

export interface OneRepMax {
  id: string;
  exerciseName: string;
  weight: number;
  reps: number;
  orm: number;
  history?: Array<{ weight: number; reps: number; orm: number; date: string }>;
  updatedAt?: TimeLike;
}

export interface DailyMetrics {
  id: string; // YYYY-MM-DD
  date: string;
  source?: 'shortcut' | 'hae' | 'appleHealth';
  restingHr?: number;
  hrv?: { avg: number; samples?: Array<{ t: string; v: number }> };
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMin?: number;
  standHours?: number;
  distanceKm?: number;
  flightsClimbed?: number;
  mindfulMin?: number;
  // start/end are ISO timestamps for the night's bed-time and wake-time (the watch
  // and HAE both record them per sleep segment); used to show "Bedtime / Wake".
  sleep?: { totalMin: number; start?: string; end?: string; stages?: { deep: number; rem: number; core: number; awake: number } };
  // Manually-logged sleep (nights with no Apple Watch). Kept separate so it never
  // overrides watch data — recovery only falls back to it when `sleep` is absent.
  // start/end are ISO timestamps for a manually-logged nap/night ("I slept from X to
  // Y"). When present they let combinedSleepMin tell a separate nap (adds) from a
  // re-logged watch night (doesn't double-count). bedtime is the older "HH:MM" form.
  manualSleep?: { totalMin: number; quality?: number; bedtime?: string; start?: string; end?: string };
  vo2Max?: number;
  weightKg?: number;
  bodyFatPct?: number;
  // body composition (e.g. gym InBody/BMI report)
  bmi?: number;
  muscleMassKg?: number;
  skeletalMuscleKg?: number;
  visceralFat?: number;
  walkingHrAvg?: number;
  spo2?: number;
  respiratoryRate?: number;
  wristTempC?: number; // overnight wrist temperature (Series 8+/Ultra) — deviation feeds recovery
  waterGlasses?: number; // self-logged water intake (1 glass = 250ml); feeds recovery
  updatedAt?: TimeLike;
}

export type MarkerFlag = 'normal' | 'low' | 'high' | 'critical';

export interface LabMarker {
  name: string;
  value: number;
  unit: string;
  refLow?: number | null;
  refHigh?: number | null;
  flag: MarkerFlag;
}

export interface Lab {
  id: string;
  uploadedAt?: TimeLike;
  reportDate: string;
  lab?: string;
  pdfStoragePath: string;
  status: 'pending' | 'parsed' | 'reviewed' | 'failed';
  markers?: LabMarker[];
  jarvisSummary?: string;
  rawText?: string;
  parseError?: string;
}

export type GoalCategory = 'cardio' | 'strength' | 'body' | 'bloodMarker' | 'habit';
export type GoalStatus = 'active' | 'paused' | 'done' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  category: GoalCategory;
  metric: string;
  target: number;
  current?: number;
  unit: string;
  startDate: string;
  targetDate?: string;
  status: GoalStatus;
  notes?: string;
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: string; // YYYY-MM-DD
  date: string;
  mood?: Rating;
  energy?: Rating;
  soreness?: Rating;
  stress?: Rating;
  sleepQuality?: Rating;
  ill?: boolean; // feeling unwell — strongly lowers recovery
  notes?: string;
  tags?: string[];
  updatedAt?: TimeLike;
}

export interface Insight {
  id: string; // YYYY-MM-DD
  date: string;
  headline: string;
  body: string;
  recommendations: string[];
  inputsHash?: string;
  generatedAt?: TimeLike;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  dob?: string;
  gender?: 'M' | 'F' | 'Other';
  heightCm?: number;
  weightKg?: number;
  fitnessLevel?: 'beginner' | 'intermediate' | 'advanced';
  activityLevel?: string;
  primaryGoal?: string;
  bmi?: number;
  bmiHistory?: Array<{ date: string; weight: number; height: number; bmi: number }>;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt?: TimeLike;
  lastMessageAt?: TimeLike;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'jarvis';
  content: string;
  createdAt?: TimeLike;
  contextHash?: string;
  provider?: string; // which model answered (jarvis messages)
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  calories: number;
  protein?: number; // grams
  carbs?: number;
  fat?: number;
  items?: Array<{ name: string; calories?: number }>;
  estimated?: boolean; // true for AI estimates
  source?: 'jarvis' | 'manual' | 'plan';
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}

/** A meal inside a saved meal plan (template — not a logged entry). */
export interface PlannedMeal {
  name: string;
  time?: string; // e.g. "Breakfast", "Post-workout"
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  recipe?: string; // components / how to make it
}
export interface MealPlanDay {
  name: string; // e.g. "Non-fasting day", "Fasting day"
  meals: PlannedMeal[];
}
export interface MealPlan {
  id: string;
  title: string;
  goalKcal?: number;
  goalProtein?: number;
  note?: string;
  status: 'active' | 'archived';
  days: MealPlanDay[];
  createdAt?: TimeLike;
  updatedAt?: TimeLike;
}
