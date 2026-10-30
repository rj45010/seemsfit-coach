import { num } from '@/lib/format';
import type { LabMarker, MarkerFlag } from '@/lib/types';

const FLAG_COLOR: Record<MarkerFlag, string> = {
  normal: 'var(--color-good)',
  low: 'var(--color-warn)',
  high: 'var(--color-bad)',
  critical: 'var(--color-crit)',
};

export function MarkerGrid({ markers }: { markers: LabMarker[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {markers.map((m, i) => (
        <div key={`${m.name}-${i}`} className="bg-surface rounded-2xl p-3" style={{ boxShadow: 'var(--shadow-1)' }}>
          <div className="mb-1 flex items-center justify-between">
            <span className="eyebrow truncate">{m.name}</span>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: FLAG_COLOR[m.flag] }}
            />
          </div>
          <p className="big-number text-2xl">
            {num(m.value, 1)}
            <span className="text-ink-2 ml-1 text-xs font-bold">{m.unit}</span>
          </p>
          {(m.refLow != null || m.refHigh != null) && (
            <p className="text-ink-3 mt-0.5 text-[10px] font-semibold">
              ref {m.refLow ?? '–'}–{m.refHigh ?? '–'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
