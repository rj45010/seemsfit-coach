import { describe, it, expect } from 'vitest';
import {
  ageFromBirthDate,
  keytelKcalPerMin,
  caloriesFromHR,
  metForActivity,
  caloriesFromMET,
  estimateWorkoutCalories,
  estimateCalories,
  type CalorieProfile,
} from './calories';

const MALE: CalorieProfile = { weightKg: 70, ageYears: 30, sex: 'male' };
const FEMALE: CalorieProfile = { weightKg: 70, ageYears: 30, sex: 'female' };

describe('ageFromBirthDate', () => {
  it('computes whole years, respecting the month/day', () => {
    const now = new Date('2026-07-04');
    expect(ageFromBirthDate('1996-07-04', now)).toBe(30);
    expect(ageFromBirthDate('1996-07-05', now)).toBe(29); // birthday not reached yet
  });
  it('falls back to 30 on missing/invalid input', () => {
    expect(ageFromBirthDate(undefined)).toBe(30);
    expect(ageFromBirthDate('not-a-date')).toBe(30);
  });
});

describe('keytelKcalPerMin', () => {
  it('matches the published male regression', () => {
    // (-55.0969 + 0.6309·140 + 0.1988·70 + 0.2017·30) / 4.184 ≈ 12.71 kcal/min
    expect(keytelKcalPerMin(140, MALE)).toBeCloseTo(12.71, 1);
  });
  it('matches the published female regression', () => {
    expect(keytelKcalPerMin(140, FEMALE)).toBeCloseTo(8.51, 1);
  });
  it('averages the two for "other"', () => {
    const other = keytelKcalPerMin(140, { ...MALE, sex: 'other' });
    expect(other).toBeCloseTo((12.71 + 8.51) / 2, 1);
  });
  it('never goes negative near resting HR', () => {
    expect(keytelKcalPerMin(45, MALE)).toBeGreaterThanOrEqual(0);
  });
});

describe('caloriesFromHR', () => {
  it('sums per-minute samples', () => {
    const samples = Array.from({ length: 30 }, () => ({ bpm: 140, minutes: 1 }));
    expect(caloriesFromHR(samples, MALE)).toBeCloseTo(381, 0);
  });
});

describe('MET fallback', () => {
  it('scales the base MET by RPE around a moderate 5', () => {
    expect(metForActivity('Running', 5)).toBeCloseTo(9.0, 1);
    expect(metForActivity('Running', 10)).toBeGreaterThan(metForActivity('Running', 5));
  });
  it('computes plausible kcal for a 30-min run at RPE 6', () => {
    const kcal = caloriesFromMET('Running', 6, 30, MALE);
    expect(kcal).toBeGreaterThan(300);
    expect(kcal).toBeLessThan(420);
  });
});

describe('estimateWorkoutCalories (blend)', () => {
  it('uses HR when samples are present', () => {
    const withHR = estimateWorkoutCalories({
      category: 'Running', durationMin: 30, profile: MALE,
      hrSamples: Array.from({ length: 30 }, () => ({ bpm: 150, minutes: 1 })),
    });
    const noHR = estimateWorkoutCalories({ category: 'Running', durationMin: 30, rpe: 6, profile: MALE });
    expect(withHR).toBeGreaterThan(0);
    expect(noHR).toBeGreaterThan(0);
    expect(withHR).not.toBe(noHR); // different branch
  });
});

describe('estimateCalories (back-compat)', () => {
  it('returns undefined without duration or weight', () => {
    expect(estimateCalories({ category: 'Running' })).toBeUndefined();
    expect(estimateCalories({ category: 'Running', durationMin: 30, weightKg: 0 })).toBeUndefined();
  });
  it('returns a whole number when inputs are present', () => {
    const kcal = estimateCalories({ category: 'Running', durationMin: 30, rpe: 6, weightKg: 70 });
    expect(kcal).toBeGreaterThan(300);
    expect(Number.isInteger(kcal)).toBe(true);
  });
});
