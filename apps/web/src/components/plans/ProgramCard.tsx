import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PlanDayCard } from './PlanDayCard';
import type { ProgramGroup } from '@/features/plans';

/** A saved program shown as a single box; tap to reveal its loggable days. */
export function ProgramCard({
  program,
  today,
  defaultOpen = false,
}: {
  program: ProgramGroup;
  today: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const count = program.days.length;
  const accent = program.status === 'archived' ? 'var(--color-surface)' : 'var(--color-butter)';

  return (
    <div className="nb-card overflow-hidden" style={{ background: accent }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="display truncate text-lg leading-tight">{program.title}</p>
            {program.goalType && (
              <span className="text-ink-2 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2 py-0.5 text-[10px] font-semibold">
                {program.goalType}
              </span>
            )}
          </div>
          <p className="text-ink-2 text-xs font-semibold">
            {count} day{count !== 1 ? 's' : ''}
            {program.status === 'archived' ? ' · archived' : ''}
          </p>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={3}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {program.days.map((p) => (
            <PlanDayCard key={p.id} plan={p} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
