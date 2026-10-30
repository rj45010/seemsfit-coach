import { WORKOUT_ICONS, type WorkoutIcon } from './workoutIcons';
import type { WorkoutCategory } from './types';

/**
 * The full Apple Fitness ("Add Workout") activity list. Each specific type maps
 * to one of our broad WorkoutCategory buckets (drives cardio-vs-strength logic
 * and accent) and to its own custom glyph so History is recognisable by image
 * alone. The picked `name` is saved as the workout's `sport`.
 */
export interface WorkoutType {
  name: string;
  category: WorkoutCategory;
  icon: WorkoutIcon;
}

const DEFS: Array<[string, WorkoutCategory]> = [
  // Strength / functional
  ['Traditional Strength Training', 'Strength'],
  ['Functional Strength Training', 'Strength'],
  ['Cross Training', 'Strength'],
  ['Gymnastics', 'Strength'],
  ['Climbing', 'Strength'],
  ['Bouldering', 'Strength'],
  // Core
  ['Core Training', 'Core'],
  // HIIT
  ['High Intensity Interval Training', 'HIIT'],
  ['Jump Rope', 'HIIT'],
  ['Step Training', 'HIIT'],
  ['Stair Stepper', 'HIIT'],
  ['Mixed Cardio', 'HIIT'],
  // Running
  ['Outdoor Run', 'Running'],
  ['Indoor Run', 'Running'],
  ['Trail Running', 'Running'],
  ['Track & Field', 'Running'],
  // Cycling
  ['Outdoor Cycling', 'Cycling'],
  ['Indoor Cycling', 'Cycling'],
  ['Hand Cycling', 'Cycling'],
  // Walking
  ['Outdoor Walk', 'Walking'],
  ['Indoor Walk', 'Walking'],
  ['Elliptical', 'Walking'],
  ['Rowing', 'Cycling'],
  ['Wheelchair Walk Pace', 'Walking'],
  ['Wheelchair Run Pace', 'Running'],
  // Hiking
  ['Hiking', 'Hiking'],
  // Swimming / water
  ['Pool Swim', 'Swimming'],
  ['Open Water Swim', 'Swimming'],
  ['Water Fitness', 'Swimming'],
  ['Water Polo', 'Swimming'],
  ['Water Sports', 'Swimming'],
  ['Surfing', 'Swimming'],
  ['Sailing', 'Swimming'],
  ['Paddling', 'Swimming'],
  ['Kayaking', 'Swimming'],
  // Yoga / mind & body
  ['Yoga', 'Yoga'],
  ['Pilates', 'Yoga'],
  ['Barre', 'Yoga'],
  ['Flexibility', 'Yoga'],
  ['Cooldown', 'Yoga'],
  ['Mind & Body', 'Yoga'],
  ['Tai Chi', 'Yoga'],
  // Dance / fitness
  ['Dance', 'HIIT'],
  ['Cardio Dance', 'HIIT'],
  ['Fitness Gaming', 'HIIT'],
  // Ball & court sports
  ['Basketball', 'Other'],
  ['Soccer', 'Other'],
  ['American Football', 'Other'],
  ['Australian Football', 'Other'],
  ['Rugby', 'Other'],
  ['Hockey', 'Other'],
  ['Volleyball', 'Other'],
  ['Baseball', 'Other'],
  ['Softball', 'Other'],
  ['Cricket', 'Other'],
  ['Tennis', 'Other'],
  ['Table Tennis', 'Other'],
  ['Badminton', 'Other'],
  ['Squash', 'Other'],
  ['Racquetball', 'Other'],
  ['Pickleball', 'Other'],
  ['Padel', 'Other'],
  ['Handball', 'Other'],
  ['Lacrosse', 'Other'],
  ['Golf', 'Other'],
  ['Disc Sports', 'Other'],
  ['Bowling', 'Other'],
  // Combat
  ['Boxing', 'HIIT'],
  ['Kickboxing', 'HIIT'],
  ['Martial Arts', 'HIIT'],
  ['Wrestling', 'Other'],
  ['Fencing', 'Other'],
  // Snow & ice
  ['Downhill Skiing', 'Other'],
  ['Cross Country Skiing', 'Other'],
  ['Snowboarding', 'Other'],
  ['Skating', 'Other'],
  ['Snow Sports', 'Other'],
  // Outdoor & misc
  ['Equestrian', 'Other'],
  ['Hunting', 'Other'],
  ['Fishing', 'Other'],
  ['Play', 'Other'],
  ['Other', 'Other'],
];

export const WORKOUT_TYPES: WorkoutType[] = DEFS.map(([name, category]) => ({
  name,
  category,
  icon: WORKOUT_ICONS[name] ?? WORKOUT_ICONS.Other,
}));

const BY_NAME = new Map(WORKOUT_TYPES.map((t) => [t.name.toLowerCase(), t]));

/** Look up a specific workout type by its (case-insensitive) name. */
export function typeByName(name?: string | null): WorkoutType | undefined {
  return name ? BY_NAME.get(name.trim().toLowerCase()) : undefined;
}

/** The custom glyph for a logged workout, by its specific type (else undefined). */
export function iconForType(name?: string | null): WorkoutIcon | undefined {
  return typeByName(name)?.icon;
}

/** Find the bucket for a typed/freeform sport name, falling back to Other. */
export function categoryForType(name: string): WorkoutCategory {
  return typeByName(name)?.category ?? 'Other';
}
