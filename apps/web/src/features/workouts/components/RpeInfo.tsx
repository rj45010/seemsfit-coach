import { useState } from 'react';
import { Info } from 'lucide-react';
import { InfoSheet } from '@/components/ui/InfoSheet';

const ROWS: Array<[string, string]> = [
  ['10', 'All-out — no more reps possible (0 in reserve)'],
  ['9', '1 more rep possible (1 RIR)'],
  ['8', '2 more reps (2 RIR) — common working zone'],
  ['7', '3–4 more reps — moderate'],
  ['≤6', 'Easy / warm-up'],
];

/** Small (i) that explains the RPE scale. Tap-friendly, stops row toggles. */
export function RpeInfo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label="What is RPE?"
        className="text-ink-3 hover:text-ink"
      >
        <Info size={11} strokeWidth={2.5} />
      </button>
      {open && (
        <InfoSheet title="RPE — Rate of Perceived Exertion" onClose={() => setOpen(false)}>
          <p>How hard a set felt, 1–10. It tracks <b>reps left in the tank</b> (RIR = Reps In Reserve = 10 − RPE), so it's a precise, honest measure of effort.</p>
          <div className="my-1 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)]">
            {ROWS.map(([n, d], i) => (
              <div key={n} className={`flex gap-3 px-3 py-1.5 text-sm ${i % 2 ? 'bg-surface' : ''}`}>
                <span className="big-number w-8 shrink-0">{n}</span>
                <span className="font-medium">{d}</span>
              </div>
            ))}
          </div>
          <p>Logging it lets Vyom <b>autoregulate</b> — e.g. "squat 3×5 @ RPE 8" adjusts the weight to how you feel — spot when you need a <b>deload</b>, and compute your training load accurately. It's optional; leave it blank if you don't want to.</p>
        </InfoSheet>
      )}
    </>
  );
}
