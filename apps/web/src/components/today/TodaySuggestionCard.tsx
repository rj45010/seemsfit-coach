import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { catMeta } from '@/lib/workoutMeta';
import { suggestExercise, type Readiness } from '@/lib/progression';
import type { Plan } from '@/lib/types';

const KIND_DOT: Record<string, string> = {
  up: 'var(--color-mint)',
  rep: 'var(--color-sky)',
  hold: 'var(--color-butter)',
  log: 'var(--color-ink-3)',
};

/** One session — collapsed by default; tap the header to reveal its suggestions. */
function SessionCard({ plan, readiness }: { plan: Plan; readiness?: Readiness }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, accent } = catMeta(plan.category);
  const exercises = plan.exercises ?? [];
  const sugg = exercises.map((ex) => suggestExercise(ex, readiness));

  return (
    <Card accent={accent} className="overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sys-fill">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{plan.title}</p>
          <p className="text-ink-2 text-xs font-semibold">{exercises.length} exercises · tap for suggestions</p>
        </div>
        <ChevronDown size={18} strokeWidth={2.5} className={`text-ink-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {sugg.length > 0 && (
            <ul className="border-line/20 mt-3 flex flex-col gap-2 border-t-2 pt-3">
              {sugg.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[s.kind] }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{s.name}</p>
                    <p className="text-ink-2 text-xs font-semibold leading-snug">
                      {s.last ? <span className="text-ink-3">{s.last} → </span> : null}
                      {s.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/train?open=${plan.id}`} className="text-ink mt-3 flex items-center justify-center gap-1 text-xs font-bold underline">
            Open to log <ChevronRight size={13} strokeWidth={3} />
          </Link>
        </>
      )}
    </Card>
  );
}

/**
 * Today's session(s) with an autoregulated progression suggestion per exercise,
 * computed from last-logged sets + RPE. Collapsed by default; following it is optional.
 */
export function TodaySuggestionCard({
  sessions,
  weekday,
  recovery,
  strain,
}: {
  sessions: Plan[];
  weekday: string;
  recovery?: { score: number } | null;
  strain?: { value: number } | null;
}) {
  if (sessions.length === 0) return null;

  // Today's recommended exertion budget from recovery (0–100, same as the Exertion bar).
  const targetStrain = recovery ? Math.round(recovery.score) : undefined;
  const readiness: Readiness = { recoveryScore: recovery?.score, strainValue: strain?.value, targetStrain };

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-1.5">
        <ArrowUpRight size={14} strokeWidth={2.5} />
        <p className="eyebrow">Today's suggestion · {weekday}</p>
      </div>
      <div className="flex flex-col gap-3">
        {sessions.map((p) => (
          <SessionCard key={p.id} plan={p} readiness={readiness} />
        ))}
      </div>
    </section>
  );
}
