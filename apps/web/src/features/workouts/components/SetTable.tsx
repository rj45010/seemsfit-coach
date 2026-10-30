import { ArrowDown } from 'lucide-react';
import { supersetGroups } from '@/lib/supersets';
import type { ExerciseSets } from '@/lib/types';

/** Renders strength exercises; each superset group shows its own label + accent. */
export function SetTable({ exercises }: { exercises: ExerciseSets[] }) {
  const groups = supersetGroups(exercises);
  return (
    <div className="flex flex-col gap-3">
      {exercises.map((ex, i) => {
        const g = ex.supersetId ? groups[ex.supersetId] : undefined;
        return (
        <div
          key={`${ex.name}-${i}`}
          className="bg-surface rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)] p-3"
          style={g ? { borderLeftWidth: 4, borderLeftColor: g.color } : undefined}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">{ex.name}</p>
            {g && <span className="eyebrow" style={{ color: g.color }}>Superset {g.label}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ex.sets.map((s, j) => (
              <span
                key={j}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-semibold"
                style={{ background: s.isDrop ? 'var(--color-peach)' : 'var(--color-butter)' }}
              >
                {s.bodyweight ? 'BW' : <>{s.weight}{typeof s.weight === 'number' ? 'kg' : ''}</>} × {s.reps}
                {s.rpe != null && <span className="text-ink-2">@{s.rpe}</span>}
                {s.isDrop && <ArrowDown size={11} strokeWidth={3} />}
              </span>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
