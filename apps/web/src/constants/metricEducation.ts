/**
 * Plain-language education for the metric detail pages. The core "what it means"
 * line is reused from lib/metricConfig.ts (`desc`); here we add an optional
 * healthy-range note and, for sleep, a breakdown of each stage. Beginner-friendly
 * by design — teach what the number means, not just show it.
 */

/** Optional healthy-range / how-to-read note per metric key. */
export const METRIC_RANGE: Record<string, string> = {
  restingHr:
    'A typical adult resting heart rate is 60–100 bpm. Fitter people often sit lower, around 40–60. What matters most is your own trend over time.',
  hrv: 'HRV is very personal — there is no single "good" number. Learn your own normal range and watch how it moves, rather than comparing to anyone else.',
  sleep: 'Most adults do best with a steady 7–9 hours a night. One short night matters less than your average across the week.',
  steps: 'There is nothing magic about 10,000, but 7,000–10,000 steps a day is a solid, healthy target for most people.',
  vo2Max:
    'Higher is fitter. It rises with regular cardio (running, cycling, brisk walks) and slowly drifts down if you stop. Track the direction, not one reading.',
  weightKg: 'Whether up or down is good depends entirely on your goal. Weigh at a consistent time and read the weekly trend, not day-to-day noise.',
  bodyFatPct: 'Healthy ranges vary a lot by age and sex, and athletes sit lower. Use it as your own trend rather than a hard target.',
  bmi: 'The standard "normal" band is 18.5–24.9, but BMI does not know muscle from fat — muscular people often read high while being lean.',
  muscleMassKg: 'More muscle is generally better for strength, metabolism and healthy ageing. Build it slowly with training and enough protein.',
  visceralFat: 'This is the fat around your organs. Lower is healthier — higher levels are linked to greater metabolic risk.',
};

export interface SleepStage {
  key: 'deep' | 'rem' | 'core' | 'awake';
  label: string;
  color: string; // matches SleepCard's curated palette
  what: string;
  range: string;
}

/** What each sleep stage does + a rough share of a healthy night. */
export const SLEEP_STAGES: SleepStage[] = [
  {
    key: 'deep',
    label: 'Deep',
    color: '#3b2e8c',
    what: 'The most physically restorative sleep — muscle repair, immune support and hormone release happen here. It is hardest to wake from.',
    range: 'Roughly 13–23% of the night',
  },
  {
    key: 'rem',
    label: 'REM',
    color: '#7c5cd6',
    what: 'The dreaming stage. Your brain files away memories and processes emotions, so it matters a lot for learning and mood.',
    range: 'Roughly 20–25% of the night',
  },
  {
    key: 'core',
    label: 'Core',
    color: '#9db8ff',
    what: 'Lighter sleep that makes up the bulk of the night and bridges the deeper stages. Still important — it is not "wasted" sleep.',
    range: 'Roughly 45–55% of the night',
  },
  {
    key: 'awake',
    label: 'Awake',
    color: '#ffd2b0',
    what: 'Brief awakenings during the night. A few are completely normal and everyone has them, even if you do not remember.',
    range: 'A small part of the night',
  },
];

export const SLEEP_STAGES_TITLE = 'Your sleep stages';
export const SLEEP_STAGES_INTRO =
  'Through the night you cycle between these stages. A good night has a healthy mix of all of them, not just long hours.';

export const EDU_HEADING = 'What this means';
export const RANGE_HEADING = 'What is healthy';
