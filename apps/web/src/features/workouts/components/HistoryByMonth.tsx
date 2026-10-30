import { useMemo } from 'react';
import { format } from 'date-fns';
import { WorkoutCard } from './WorkoutCard';
import { toDate } from '@/lib/date';
import { km, duration as fmtDur } from '@/lib/format';
import type { Workout } from '@/lib/types';

interface MonthGroup {
  key: string; // yyyy-MM
  label: string; // "June 2026"
  items: Workout[];
}

function groupByMonth(workouts: Workout[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const w of workouts) {
    const d = toDate(w.customDate ?? w.createdAt) ?? new Date(0);
    const key = format(d, 'yyyy-MM');
    if (!map.has(key)) map.set(key, { key, label: format(d, 'MMMM yyyy'), items: [] });
    map.get(key)!.items.push(w);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** Per-month headline: distance for cardio, otherwise a session count. */
function summarize(items: Workout[], cardio: boolean): string {
  const n = items.length;
  if (cardio) {
    const dist = items.reduce((s, w) => s + (w.distance ?? 0), 0);
    if (dist > 0) return `${n} · ${km(dist)} km`;
    const mins = items.reduce((s, w) => s + (w.duration ?? 0), 0);
    if (mins > 0) return `${n} · ${fmtDur(mins)}`;
  }
  return `${n} session${n !== 1 ? 's' : ''}`;
}

/** History list grouped by month, each month showing a total summary. */
export function HistoryByMonth({ workouts, cardio }: { workouts: Workout[]; cardio: boolean }) {
  const groups = useMemo(() => groupByMonth(workouts), [workouts]);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="eyebrow">{g.label}</p>
            <span className="text-ink-2 shrink-0 text-xs font-bold">{summarize(g.items, cardio)}</span>
          </div>
          <div className="flex flex-col gap-3">
            {g.items.map((w, i) => (
              <WorkoutCard key={w.id} w={w} delay={Math.min(i * 0.03, 0.2)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
