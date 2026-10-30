import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { RatingRow } from '@/components/journal/RatingRow';
import { useJournalEntry, useJournalMutation } from '@/hooks/useJournal';
import { todayKey } from '@/lib/date';
import type { Rating } from '@/lib/types';

const FIELDS = [
  { key: 'mood', label: 'Mood', accent: 'var(--color-pink)' },
  { key: 'energy', label: 'Energy', accent: 'var(--color-butter)' },
  { key: 'soreness', label: 'Soreness', accent: 'var(--color-peach)' },
  { key: 'stress', label: 'Stress', accent: 'var(--color-lavender)' },
  { key: 'sleepQuality', label: 'Sleep quality', accent: 'var(--color-sky)' },
] as const;

type Key = (typeof FIELDS)[number]['key'];
type Ratings = Partial<Record<Key, Rating>>;

/**
 * Inline "how you feel today" card for the home screen. Reuses the journal
 * store: tapping a rating saves that field (merge) and keeps local state for
 * instant feedback. Notes + history live on the full Journal page.
 */
export function TodayJournalCard() {
  const date = todayKey();
  const { data: entry } = useJournalEntry(date);
  const save = useJournalMutation();

  // Local taps win over the fetched entry for instant feedback; both fall back
  // to the saved value. Avoids an effect that would mirror entry → state.
  const [overrides, setOverrides] = useState<Ratings>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setField(key: Key, v: Rating) {
    setOverrides((o) => ({ ...o, [key]: v }));
    save.mutate(
      { date, [key]: v },
      {
        onSuccess: () => {
          setSavedFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
        },
      },
    );
  }

  const valueFor = (key: Key): Rating | undefined => overrides[key] ?? entry?.[key];

  const [illOverride, setIllOverride] = useState<boolean | null>(null);
  const ill = illOverride ?? entry?.ill ?? false;
  function toggleIll() {
    const next = !ill;
    setIllOverride(next);
    save.mutate({ date, ill: next });
  }

  return (
    <Card accent="surface" className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Journal · auto-saved</p>
          <div className="flex items-center gap-2">
            <p className="font-bold">How do you feel today?</p>
            {save.isPending ? (
              <span className="text-ink-3 text-[11px] font-bold">Saving…</span>
            ) : savedFlash ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-mint)] px-2.5 py-0.5 text-[10px] font-semibold">
                <Check size={11} strokeWidth={3} /> Saved
              </span>
            ) : null}
          </div>
        </div>
        <Link to="/journal" className="text-ink flex items-center text-xs font-bold underline">
          Notes <ChevronRight size={14} strokeWidth={3} />
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {FIELDS.map((f) => (
          <RatingRow
            key={f.key}
            label={f.label}
            accent={f.accent}
            value={valueFor(f.key)}
            onChange={(v) => setField(f.key, v)}
          />
        ))}
      </div>

      <button
        onClick={toggleIll}
        aria-pressed={ill}
        className="mt-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-opacity active:opacity-70"
        style={{ background: ill ? 'var(--color-bad)' : 'color-mix(in srgb, var(--color-ink) 6%, transparent)' }}
      >
        <span>Feeling ill today</span>
        <span className="inline-flex h-6 w-10 items-center rounded-full p-0.5" style={{ background: ill ? 'var(--color-paper)' : 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
          <span className="h-5 w-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: ill ? 'translateX(16px)' : 'translateX(0)' }} />
        </span>
      </button>
    </Card>
  );
}
