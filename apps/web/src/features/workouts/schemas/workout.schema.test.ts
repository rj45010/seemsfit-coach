import { describe, it, expect } from 'vitest';
import { activityDraftSchema } from './workout.schema';

describe('activityDraftSchema', () => {
  it('accepts a valid strength session', () => {
    const r = activityDraftSchema.safeParse({
      category: 'Strength',
      sport: 'Push Day',
      date: '2026-07-02',
      durationMin: 52.5,
      effort: 8,
      feel: 'good',
      exerciseSets: [{ name: 'Bench', supersetId: null, sets: [{ weight: 60, reps: 8, isDrop: false, rpe: 8 }] }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a cardio session with distance', () => {
    expect(activityDraftSchema.safeParse({ category: 'Running', distanceKm: 5, durationMin: 26 }).success).toBe(true);
  });

  it('rejects an unknown category and out-of-range effort', () => {
    expect(activityDraftSchema.safeParse({ category: 'Pickleball' }).success).toBe(false);
    expect(activityDraftSchema.safeParse({ category: 'Strength', effort: 12 }).success).toBe(false);
  });
});
