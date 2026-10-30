import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RatingRow } from '@/components/journal/RatingRow';
import { useJournalEntry, useJournalMutation } from '@/hooks/useJournal';
import { todayKey } from '@/lib/date';
import type { Rating } from '@/lib/types';

const FIELDS: Array<{ key: 'mood' | 'energy' | 'soreness' | 'stress' | 'sleepQuality'; label: string; accent: string }> = [
  { key: 'mood', label: 'Mood', accent: 'var(--color-pink)' },
  { key: 'energy', label: 'Energy', accent: 'var(--color-butter)' },
  { key: 'soreness', label: 'Soreness', accent: 'var(--color-peach)' },
  { key: 'stress', label: 'Stress', accent: 'var(--color-lavender)' },
  { key: 'sleepQuality', label: 'Sleep quality', accent: 'var(--color-sky)' },
];

type Ratings = Partial<Record<(typeof FIELDS)[number]['key'], Rating>>;

export default function Journal() {
  const [date, setDate] = useState(todayKey());
  const { data: entry } = useJournalEntry(date);
  const save = useJournalMutation();

  const [ratings, setRatings] = useState<Ratings>({});
  const [notes, setNotes] = useState('');
  // Transient "Saved ✓" confirmation; settles back to the Update state after.
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the entry whenever the day changes.
  useEffect(() => {
    setRatings({
      mood: entry?.mood,
      energy: entry?.energy,
      soreness: entry?.soreness,
      stress: entry?.stress,
      sleepQuality: entry?.sleepQuality,
    });
    setNotes(entry?.notes ?? '');
  }, [entry, date]);

  // A saved doc already exists for this day → saving overwrites it.
  const hasEntry = !!entry;

  async function handleSave() {
    await save.mutateAsync({ date, ...ratings, notes: notes.trim() || undefined });
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
  }

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="How you feel" title="Journal" />

      <input
        type="date"
        value={date}
        max={todayKey()}
        onChange={(e) => setDate(e.target.value)}
        className="mb-4 rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender"
      />

      <Card accent="surface" className="mb-4 flex flex-col gap-3">
        {FIELDS.map((f) => (
          <RatingRow
            key={f.key}
            label={f.label}
            accent={f.accent}
            value={ratings[f.key]}
            onChange={(v) => {
              setRatings((r) => ({ ...r, [f.key]: v }));
              setSavedFlash(false);
            }}
          />
        ))}
      </Card>

      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSavedFlash(false);
        }}
        rows={4}
        placeholder="Anything worth noting today?"
        className="mb-4 w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender"
      />

      <Button
        variant={savedFlash ? 'mint' : hasEntry ? 'lavender' : 'ink'}
        onClick={handleSave}
        disabled={save.isPending}
      >
        {save.isPending
          ? 'Saving…'
          : savedFlash
            ? 'Saved ✓'
            : hasEntry
              ? 'Update entry'
              : 'Save entry'}
      </Button>
    </>
  );
}
