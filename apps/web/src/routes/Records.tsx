import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { useOneRepMax } from '@/features/workouts';
import { num } from '@/lib/format';
import type { OneRepMax } from '@/lib/types';

/** Tiny inline 1RM-over-time sparkline (SVG). values oldest→newest. */
function Sparkline({ values, width = 240, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${height - pad} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" preserveAspectRatio="none">
      <path d={area} fill="var(--color-ink)" opacity={0.07} />
      <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--color-ink)" />
    </svg>
  );
}

function PrCard({ pr, delay }: { pr: OneRepMax; delay: number }) {
  const [open, setOpen] = useState(false);
  const history = [...(pr.history ?? [])].sort((a, b) => a.date.localeCompare(b.date)); // oldest→newest
  const hasHistory = history.length > 1;
  const bestOrm = Math.max(...(history.length ? history.map((h) => h.orm) : [pr.orm]));
  const rows = [...history].reverse(); // newest first for the list

  return (
    <Card accent="lavender" delay={delay} animate={false}>
      <button
        onClick={() => hasHistory && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        disabled={!hasHistory}
      >
        <div className="min-w-0">
          <p className="truncate font-bold">{pr.exerciseName}</p>
          <p className="text-ink-2 text-xs font-semibold">
            best: {pr.weight}kg × {pr.reps}
            {hasHistory ? ` · ${history.length} logged` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="big-number text-2xl">{num(pr.orm, 1)}</p>
            <p className="eyebrow text-[9px]">est. 1RM (kg)</p>
          </div>
          {hasHistory && (
            <ChevronDown size={16} strokeWidth={2.5} className={`text-ink-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {open && hasHistory && (
        <div className="mt-3 border-t border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)] pt-3">
          <Sparkline values={history.map((h) => h.orm)} />
          <div className="mt-2 flex flex-col gap-1.5">
            {rows.map((h, i) => {
              const isBest = h.orm === bestOrm;
              return (
                <div key={`${h.date}-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2 w-20 shrink-0 text-xs font-semibold">{format(new Date(h.date), 'd MMM yy')}</span>
                  <span className="font-semibold">{h.weight}kg × {h.reps}</span>
                  <span className={`font-bold ${isBest ? 'text-ink' : 'text-ink-2'}`}>
                    {num(h.orm, 1)}
                    {isBest ? <span className="text-ink-3 ml-1 text-[10px] font-bold uppercase">best</span> : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Records() {
  const { data, isLoading } = useOneRepMax();

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="Personal records" title="PRs" />

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No PRs yet" hint="Log a strength session and Vyom will track your estimated 1-rep max automatically." />
      ) : (
        <div className="flex flex-col gap-3">
          {data!.map((pr, i) => (
            <PrCard key={pr.id} pr={pr} delay={Math.min(i * 0.03, 0.3)} />
          ))}
        </div>
      )}
    </>
  );
}
