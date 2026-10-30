import { useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { toDate } from '@/lib/date';
import { num } from '@/lib/format';
import { NUTRITION } from '../constants/messages';
import type { MealEntry } from '../types';

/** Logged meal — collapsed to one line; tap to reveal the full name + macro breakdown. */
export function MealRow({ meal, onDelete, deleting }: { meal: MealEntry; onDelete: () => void; deleting: boolean }) {
  const [open, setOpen] = useState(false);
  const loggedAt = toDate(meal.createdAt);

  return (
    <Card accent="surface" animate={false} className="py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className={cn('font-bold', open ? 'wrap-break-word' : 'truncate')}>
            {meal.name}
            {meal.estimated ? <span className="text-ink-3 font-semibold"> · est</span> : null}
          </p>
          <p className="text-ink-2 text-xs font-semibold">
            {num(meal.calories)} kcal
            {meal.protein != null ? ` · P${num(meal.protein)}` : ''}
            {meal.carbs != null ? ` C${num(meal.carbs)}` : ''}
            {meal.fat != null ? ` F${num(meal.fat)}` : ''}
          </p>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={2.5}
          className={cn('text-ink-3 mt-0.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 border-t border-[color-mix(in_srgb,var(--color-ink)_10%,transparent)] pt-3">
          {loggedAt && (
            <p className="eyebrow mb-3">
              Logged · {loggedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          {meal.items && meal.items.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1">
              {meal.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-ink font-semibold wrap-break-word">{it.name}</span>
                  {it.calories != null && (
                    <span className="text-ink-3 shrink-0 text-xs font-bold">{num(it.calories)} kcal</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="big-number text-lg leading-none">{num(meal.calories)}</p>
              <p className="eyebrow mt-1 text-[9px]">kcal</p>
            </div>
            <div>
              <p className="big-number text-lg leading-none">{meal.protein != null ? num(meal.protein) : '-'}</p>
              <p className="eyebrow mt-1 text-[9px]">protein g</p>
            </div>
            <div>
              <p className="big-number text-lg leading-none">{meal.carbs != null ? num(meal.carbs) : '-'}</p>
              <p className="eyebrow mt-1 text-[9px]">carbs g</p>
            </div>
            <div>
              <p className="big-number text-lg leading-none">{meal.fat != null ? num(meal.fat) : '-'}</p>
              <p className="eyebrow mt-1 text-[9px]">fat g</p>
            </div>
          </div>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-crit mt-3 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={2.5} /> {deleting ? NUTRITION.actions.deleting : NUTRITION.actions.delete}
          </button>
        </div>
      )}
    </Card>
  );
}
