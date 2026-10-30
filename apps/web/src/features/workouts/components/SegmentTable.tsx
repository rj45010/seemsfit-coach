import type { Segment } from '@/lib/types';

const KIND_COLOR: Record<Segment['kind'], string> = {
  run: 'var(--color-sky)',
  station: 'var(--color-lavender)',
  rest: 'var(--color-ink-3)',
};

function dur(sec?: number): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SegmentTable({ segments }: { segments: Segment[] }) {
  const sorted = [...segments].sort((a, b) => a.order - b.order);
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((s, i) => (
        <div
          key={i}
          className="bg-surface flex items-center justify-between rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)] p-3"
          style={{ borderLeftWidth: 4, borderLeftColor: KIND_COLOR[s.kind] }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{s.label || s.kind}</p>
            <span className="eyebrow text-[9px]">{s.kind}</span>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-x-2 font-mono text-xs font-bold">
            {s.distanceM != null && <span>{s.distanceM >= 1000 ? `${(s.distanceM / 1000).toFixed(2)}km` : `${s.distanceM}m`}</span>}
            {dur(s.durationSec) && <span>{dur(s.durationSec)}</span>}
            {s.reps != null && <span>{s.reps} reps</span>}
            {s.weightKg != null && <span>{s.weightKg}kg</span>}
            {s.pace && <span>{s.pace}</span>}
            {s.avgHr != null && <span>{s.avgHr}bpm</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
