import {
  Dumbbell,
  Footprints,
  Bike,
  Mountain,
  Waves,
  Zap,
  Flower2,
  Activity,
  PersonStanding,
  type LucideIcon,
} from 'lucide-react';
import type { WorkoutCategory } from './types';

type Accent = 'surface' | 'pink' | 'mint' | 'lavender' | 'butter' | 'peach' | 'sky';

// Icons stay per-type (useful signal), but every category uses the SAME neutral surface — no
// per-workout colours (single simple theme).
export const CATEGORY_META: Record<WorkoutCategory, { icon: LucideIcon; accent: Accent }> = {
  Strength: { icon: Dumbbell, accent: 'surface' },
  Running: { icon: Footprints, accent: 'surface' },
  Cycling: { icon: Bike, accent: 'surface' },
  Walking: { icon: PersonStanding, accent: 'surface' },
  Hiking: { icon: Mountain, accent: 'surface' },
  Swimming: { icon: Waves, accent: 'surface' },
  HIIT: { icon: Zap, accent: 'surface' },
  Yoga: { icon: Flower2, accent: 'surface' },
  Core: { icon: Activity, accent: 'surface' },
  Other: { icon: Activity, accent: 'surface' },
};

export function catMeta(cat: WorkoutCategory | string | undefined) {
  return CATEGORY_META[(cat as WorkoutCategory) ?? 'Other'] ?? CATEGORY_META.Other;
}

const CARDIO = new Set<WorkoutCategory>([
  'Running',
  'Cycling',
  'Walking',
  'Hiking',
  'Swimming',
]);
export const isCardio = (cat?: string) => CARDIO.has(cat as WorkoutCategory);
