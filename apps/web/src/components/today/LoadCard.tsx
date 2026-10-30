import { Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BAND_LABEL, type LoadStats, type LoadBand } from '@/lib/load';

const BAND_COLOR: Record<LoadBand, string> = {
  low: '#9db8ff',
  optimal: '#34d399',
  high: '#fb7185',
  none: 'var(--color-surface)',
};

export function LoadCard({ stats, onInfo }: { stats: LoadStats; onInfo?: () => void }) {
  const max = Math.max(1, ...stats.byDay.map((d) => d.load));
  return (
    <Card accent="surface" className="relative mb-4">
      {onInfo && (
        <button onClick={onInfo} aria-label="About training load" className="text-ink-3 hover:text-ink absolute right-3 top-3">
          <Info size={16} strokeWidth={2.5} />
        </button>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Training load · 7 days</p>
          <p className="big-number mt-1 text-3xl">
            {stats.weekLoad} <span className="text-ink-2 text-sm font-bold">AU</span>
          </p>
          <p className="text-ink-3 text-[10px] font-semibold">minutes × effort (RPE)</p>
        </div>
        <div className="text-right">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: BAND_COLOR[stats.band] }}
          >
            {BAND_LABEL[stats.band]}
          </span>
          {stats.acwr != null && (
            <p className="text-ink-2 mt-1 text-[11px] font-bold">ACWR {stats.acwr}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex h-12 items-end gap-1">
        {stats.byDay.map((d, i) => (
          <div
            key={i}
            className="bg-lavender flex-1 rounded-t-md"
            style={{ height: `${Math.max(8, (d.load / max) * 100)}%` }}
            title={`${d.date}: ${d.load}`}
          />
        ))}
      </div>
    </Card>
  );
}
