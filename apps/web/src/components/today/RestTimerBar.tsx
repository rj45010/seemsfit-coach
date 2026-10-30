import { useEffect, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useRestEndsAt, adjustRest, stopRest } from '@/lib/restTimer';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Full-screen rest countdown, started after you log a set. Rendered once, app-wide. */
export function RestTimerBar() {
  const endsAt = useRestEndsAt();
  const [now, setNow] = useState(() => Date.now());

  // Tick for display updates.
  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  // Buzz + auto-close scheduled once when the timer starts — not on every tick.
  useEffect(() => {
    if (endsAt == null) return;
    const id = setTimeout(() => {
      navigator.vibrate?.([140, 70, 140]);
      setTimeout(stopRest, 1200);
    }, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [endsAt]);

  if (endsAt == null) return null;
  const rem = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = rem === 0;

  return (
    <div className="bg-paper safe-bottom fixed inset-0 z-50 flex flex-col items-center justify-center gap-12 px-8 md:hidden">
      <button
        onClick={stopRest}
        aria-label="Close rest timer"
        className="text-ink-3 active:text-ink absolute right-5 top-[calc(env(safe-area-inset-top,0px)+1.25rem)] transition-colors"
      >
        <X size={28} strokeWidth={2.5} />
      </button>

      <div className="flex flex-col items-center gap-4">
        <span className="eyebrow flex items-center gap-1.5">
          <Timer size={14} strokeWidth={2.5} /> Rest
        </span>
        <span
          className="big-number text-center text-7xl tabular-nums"
          style={{ color: done ? 'var(--color-mint)' : undefined }}
        >
          {done ? 'Done' : fmt(rem)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => adjustRest(-15)}
          className="text-ink h-14 w-24 rounded-2xl bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-base font-bold transition-transform active:scale-95"
        >
          −15s
        </button>
        <button
          onClick={() => adjustRest(15)}
          className="text-ink h-14 w-24 rounded-2xl bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-base font-bold transition-transform active:scale-95"
        >
          +15s
        </button>
      </div>

      <button
        onClick={stopRest}
        className="bg-ink text-paper h-14 w-full max-w-xs rounded-2xl text-base font-bold transition-transform active:scale-95"
      >
        Skip rest
      </button>
    </div>
  );
}
