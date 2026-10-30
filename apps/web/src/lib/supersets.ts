/** Distinct accent per superset group, cycled if there are more than five. */
const GROUP_COLORS = [
  'var(--color-pink)',
  'var(--color-sky)',
  'var(--color-lavender)',
  'var(--color-peach)',
  'var(--color-mint)',
];

export interface SupersetGroup {
  label: string; // 'A', 'B', …
  color: string;
}

/**
 * Map each distinct supersetId → { label, color } in the order exercises
 * appear, so two supersets read as "Superset A" and "Superset B" (each its
 * own colour) instead of a flat "superset" on every grouped exercise.
 */
export function supersetGroups(
  items: Array<{ supersetId?: string | null }>,
): Record<string, SupersetGroup> {
  const out: Record<string, SupersetGroup> = {};
  let n = 0;
  for (const e of items) {
    if (e.supersetId && !out[e.supersetId]) {
      out[e.supersetId] = { label: String.fromCharCode(65 + n), color: GROUP_COLORS[n % GROUP_COLORS.length] };
      n++;
    }
  }
  return out;
}
