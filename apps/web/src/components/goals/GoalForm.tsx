import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { todayKey } from '@/lib/date';
import type { Goal, GoalCategory } from '@/lib/types';

const field =
  'w-full min-w-0 rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

export interface GoalDraft {
  title: string;
  category: GoalCategory;
  metric: string;
  target: number;
  current?: number;
  unit: string;
  targetDate?: string;
  status: Goal['status'];
  startDate: string;
}

// Goal types that auto-track from logged data (same metrics Jarvis uses) + a manual escape hatch.
type GoalType = 'run' | 'cycle' | 'swim' | 'lift' | 'weight' | 'custom';
const TYPES: { id: GoalType; label: string; metric?: string; unit: string; category: GoalCategory; targetLabel: string; auto: string }[] = [
  { id: 'run', label: 'Run distance', metric: 'runLongestKm', unit: 'km', category: 'cardio', targetLabel: 'Target (km)', auto: 'your longest single run' },
  { id: 'cycle', label: 'Cycle distance', metric: 'rideLongestKm', unit: 'km', category: 'cardio', targetLabel: 'Target (km)', auto: 'your longest single ride' },
  { id: 'swim', label: 'Swim distance', metric: 'swimLongestKm', unit: 'km', category: 'cardio', targetLabel: 'Target (km)', auto: 'your longest single swim' },
  { id: 'lift', label: 'Lift (1-rep max)', unit: 'kg', category: 'strength', targetLabel: 'Target (kg)', auto: 'your best estimated 1RM' },
  { id: 'weight', label: 'Bodyweight', metric: 'bodyWeightKg', unit: 'kg', category: 'body', targetLabel: 'Target (kg)', auto: 'your latest logged weight' },
  { id: 'custom', label: 'Custom (manual)', unit: '', category: 'habit', targetLabel: 'Target', auto: '' },
];

const CAT_LABEL: Record<GoalCategory, string> = {
  cardio: 'Cardio',
  strength: 'Strength',
  body: 'Body',
  bloodMarker: 'Blood marker',
  habit: 'Habit',
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function typeFromMetric(m?: string): GoalType {
  if (m === 'runLongestKm') return 'run';
  if (m === 'rideLongestKm') return 'cycle';
  if (m === 'swimLongestKm') return 'swim';
  if (m === 'bodyWeightKg') return 'weight';
  if (m?.startsWith('e1rm:')) return 'lift';
  return 'custom';
}

export function GoalForm({
  initial,
  onSave,
  onDelete,
  onCancel,
  saving,
}: {
  initial?: Goal;
  onSave: (g: GoalDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [type, setType] = useState<GoalType>(typeFromMetric(initial?.metric));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [exercise, setExercise] = useState(initial?.metric?.startsWith('e1rm:') ? initial.metric.slice(5).replace(/-/g, ' ') : '');
  const [target, setTarget] = useState(String(initial?.target ?? ''));
  const [current, setCurrent] = useState(String(initial?.current ?? ''));
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [category, setCategory] = useState<GoalCategory>(initial?.category ?? 'habit');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');

  const meta = TYPES.find((t) => t.id === type)!;
  const isCustom = type === 'custom';

  function submit() {
    if (!target) return;
    let metric: string;
    let goalUnit: string;
    let goalCat: GoalCategory;
    let goalTitle = title.trim();

    if (type === 'lift') {
      if (!exercise.trim()) return;
      metric = `e1rm:${slug(exercise)}`;
      goalUnit = 'kg';
      goalCat = 'strength';
      if (!goalTitle) goalTitle = `${exercise.trim()} ${target}kg`;
    } else if (isCustom) {
      if (!goalTitle) return;
      metric = initial?.metric && typeFromMetric(initial.metric) === 'custom' ? initial.metric : goalTitle;
      goalUnit = unit.trim();
      goalCat = category;
    } else {
      metric = meta.metric!;
      goalUnit = meta.unit;
      goalCat = meta.category;
      if (!goalTitle) goalTitle = `${meta.label.split(' ')[0]} ${target}${meta.unit}`;
    }

    onSave({
      title: goalTitle,
      category: goalCat,
      metric,
      target: Number(target),
      // Typed goals auto-fill current from logs; only custom takes a manual current.
      current: isCustom ? (current === '' ? undefined : Number(current)) : initial?.current,
      unit: goalUnit,
      targetDate: targetDate || undefined,
      status: initial?.status ?? 'active',
      startDate: initial?.startDate ?? todayKey(),
    });
  }

  return (
    <Card accent="surface" className="mb-4">
      <p className="eyebrow mb-3">{initial ? 'Edit goal' : 'New goal'}</p>
      <div className="flex flex-col gap-2">
        <label className="text-ink-3 text-[10px] font-bold uppercase tracking-wide">Type</label>
        <select className={field} value={type} onChange={(e) => setType(e.target.value as GoalType)}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>

        <input className={field} placeholder={isCustom ? 'Title (e.g. Meditate daily)' : 'Title (optional — auto if blank)'} value={title} onChange={(e) => setTitle(e.target.value)} />

        {type === 'lift' && (
          <input className={field} placeholder="Exercise (e.g. Back Squat)" value={exercise} onChange={(e) => setExercise(e.target.value)} />
        )}

        <div className="flex gap-2">
          {isCustom && <input className={field} type="number" inputMode="decimal" placeholder="Current" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          <input className={field} type="number" inputMode="decimal" placeholder={meta.targetLabel} value={target} onChange={(e) => setTarget(e.target.value)} />
          {isCustom && <input className={field} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />}
        </div>

        {isCustom && (
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>
            {(['cardio', 'strength', 'body', 'bloodMarker', 'habit'] as GoalCategory[]).map((c) => (
              <option key={c} value={c}>{CAT_LABEL[c]}</option>
            ))}
          </select>
        )}

        <input className={`${field} appearance-none`} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        {targetDate ? null : <p className="text-ink-3 text-[11px] font-semibold">No date — open-ended goal.</p>}
        {!isCustom && <p className="text-ink-2 text-[11px] font-semibold">Auto-tracked from {meta.auto}.</p>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="ink" onClick={submit} disabled={saving || !target}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="surface" onClick={onCancel}>Cancel</Button>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="text-crit text-xs font-bold underline">Delete</button>
        )}
      </div>
    </Card>
  );
}
