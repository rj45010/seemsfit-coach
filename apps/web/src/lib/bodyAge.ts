/**
 * Body Age — the age at which the average person's aerobic fitness (VO2 max) equals yours.
 * If your VO2 max matches a typical 27-year-old's, your Body Age is 27, whatever your real age.
 *
 * Transparent model (NOT a proprietary algorithm): population mean VO2 max declines roughly
 * linearly with age. We anchor to ACSM / Cooper 50th-percentile norms — men ~44 ml/kg/min at
 * 25 falling ~0.375/yr, women ~37 at 25 falling ~0.32/yr — and invert to solve for the age
 * whose average VO2 max equals the user's. Heuristic; only as good as Apple's VO2 max estimate.
 */

type Sex = 'male' | 'female' | 'other' | undefined;

// [meanAt25, declinePerYear] per sex.
const MODEL: Record<'male' | 'female', [number, number]> = {
  male: [44, 0.375],
  female: [37, 0.32],
};

/**
 * Body Age from a VO2 max reading, rounded and clamped to a sane 18–85. Returns null if there's
 * no usable VO2 max. Unknown/other sex averages the male and female models.
 */
export function bodyAge(vo2Max: number | undefined, sex: Sex): number | null {
  if (vo2Max == null || vo2Max <= 0) return null;
  const ageFor = (s: 'male' | 'female') => {
    const [base, slope] = MODEL[s];
    return 25 + (base - vo2Max) / slope;
  };
  const raw = sex === 'male' || sex === 'female' ? ageFor(sex) : (ageFor('male') + ageFor('female')) / 2;
  return Math.round(Math.max(18, Math.min(85, raw)));
}

export interface BodyAgeReadout {
  age: number; // Body Age
  delta: number | null; // chronological age − Body Age (positive = younger than your years)
}

/** Body Age plus how it compares to the user's real age (null delta when age is unknown). */
export function bodyAgeReadout(vo2Max: number | undefined, sex: Sex, chronologicalAge: number | null): BodyAgeReadout | null {
  const age = bodyAge(vo2Max, sex);
  if (age == null) return null;
  return { age, delta: chronologicalAge != null ? chronologicalAge - age : null };
}
