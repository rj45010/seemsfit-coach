import { TrendingUp, Trophy, UtensilsCrossed, FlaskConical, NotebookPen, Target, UserRound, type LucideIcon } from 'lucide-react';

type Accent = 'pink' | 'mint' | 'lavender' | 'sky' | 'butter' | 'peach';

/**
 * Health screen copy + config. Kept out of the JSX so user-facing text lives in
 * one place (see CLAUDE.md — zero magic strings). Metric labels/units themselves
 * are reused from `lib/metricConfig.ts`, not duplicated here.
 */

// ── Fitness age (VO₂-based) — deliberately careful, non-medical framing ──────────
export const FITNESS_AGE = {
  eyebrow: 'Fitness age',
  /** Shown when we have a body-age but no birth date to compare against. */
  noDelta: 'based on your VO₂ max',
  /** Muted prompt when VO₂ max or sex is missing. */
  empty: 'Add your VO₂ max (from Apple Health) and your sex in Profile to see your fitness age.',
  /** Explainer shown in the InfoSheet. Motivational estimate, not a diagnosis. */
  infoTitle: 'What is fitness age?',
  infoBody:
    "An estimate of your aerobic fitness shown as an age. It compares your VO₂ max (from Apple Health) with typical values for people of your age and sex. It's a motivational snapshot, not a medical assessment or diagnosis. VO₂ max naturally moves with your cardio training.",
  link: { label: 'Body composition', to: '/profile' },
} as const;

/** Hedged, non-absolute phrasing for the age comparison. */
export function fitnessAgeDelta(delta: number | null): string {
  if (delta == null) return FITNESS_AGE.noDelta;
  if (delta === 0) return 'in line with your age';
  const n = Math.abs(delta);
  const yrs = n === 1 ? 'year' : 'years';
  return delta > 0 ? `about ${n} ${yrs} under your age` : `about ${n} ${yrs} over your age`;
}

// ── Snapshot cards ──────────────────────────────────────────────────────────────
export const SLEEP_CARD = {
  eyebrow: 'Sleep',
  empty: 'No recent night logged. Sync Apple Health or log sleep to see your stages.',
  link: { label: 'Sleep detail', to: '/trends/sleep' },
} as const;

/** Vitals mini-grid — reuses metricConfig keys; each tile opens its detail page. */
export const VITALS: Array<{ metric: string; to: string }> = [
  { metric: 'restingHr', to: '/trends/restingHr' },
  { metric: 'hrv', to: '/trends/hrv' },
  { metric: 'vo2Max', to: '/trends/vo2Max' },
  { metric: 'weightKg', to: '/trends/weightKg' },
];

export const SNAPSHOT_HEADING = 'Snapshot';
export const EXPLORE_HEADING = 'Explore';

// ── Explore nav grid — every Health destination stays one tap away ────────────────
export interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: Accent;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/trends', label: 'Trends', hint: 'HRV, sleep, RHR, weight over time', icon: TrendingUp, accent: 'sky' },
  { to: '/records', label: 'PRs', hint: 'Estimated 1RMs — auto-tracked', icon: Trophy, accent: 'butter' },
  { to: '/nutrition', label: 'Nutrition', hint: 'Meals, calories, macros', icon: UtensilsCrossed, accent: 'peach' },
  { to: '/labs', label: 'Labs', hint: 'Blood reports + Vyom read', icon: FlaskConical, accent: 'pink' },
  { to: '/journal', label: 'Journal', hint: 'Mood, energy, soreness, notes', icon: NotebookPen, accent: 'lavender' },
  { to: '/goals', label: 'Goals', hint: 'Targets across cardio, strength, body', icon: Target, accent: 'mint' },
  { to: '/profile', label: 'Profile', hint: 'Body composition + your basics for Vyom', icon: UserRound, accent: 'sky' },
];
