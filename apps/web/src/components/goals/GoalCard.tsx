import { Card } from '@/components/ui/Card';
import { num } from '@/lib/format';
import { fmtDayKey } from '@/lib/date';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Goal } from '@/lib/types';

const CAT_ACCENT: Record<Goal['category'], 'pink' | 'mint' | 'lavender' | 'butter' | 'sky'> = {
  cardio: 'pink',
  strength: 'lavender',
  body: 'mint',
  bloodMarker: 'sky',
  habit: 'butter',
};

export function GoalCard({ goal, onEdit, delay = 0 }: { goal: Goal; onEdit?: () => void; delay?: number }) {
  const pct =
    goal.current != null && goal.target
      ? Math.max(0, Math.min(100, (goal.current / goal.target) * 100))
      : 0;
  const daysLeft = goal.targetDate
    ? differenceInCalendarDays(parseISO(goal.targetDate), new Date())
    : null;

  return (
    <Card accent={CAT_ACCENT[goal.category]} delay={delay}>
      <button onClick={onEdit} className="w-full text-left">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="display text-lg leading-tight">{goal.title}</p>
          <span className="eyebrow shrink-0">{goal.category === 'bloodMarker' ? 'Blood marker' : goal.category}</span>
        </div>
        <p className="text-ink-2 mb-2 text-xs font-bold">
          {num(goal.current ?? 0, 1)} / {num(goal.target, 1)} {goal.unit}
        </p>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        {daysLeft != null && (
          <p className="text-ink-2 mt-2 text-[11px] font-semibold">
            {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`} ·{' '}
            {goal.targetDate && fmtDayKey(goal.targetDate)}
          </p>
        )}
      </button>
    </Card>
  );
}
