import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useDayNutrition, NUTRITION } from '@/features/nutrition';
import { todayKey } from '@/lib/date';
import { num } from '@/lib/format';

export function TodayNutritionCard() {
  const { totals } = useDayNutrition(todayKey());

  const pCal = (totals.protein || 0) * 4;
  const cCal = (totals.carbs || 0) * 4;
  const fCal = (totals.fat || 0) * 9;
  const macroTotal = Math.max(1, pCal + cCal + fCal);

  return (
    <Card accent="peach" className="mb-4">
      <Link to="/nutrition" className="block">
        <p className="eyebrow">{NUTRITION.today.eyebrow}</p>
        <p className="big-number mt-1 text-3xl">
          {num(Math.round(totals.calories))}{' '}
          <span className="text-ink-2 text-sm font-bold">kcal</span>
        </p>
      </Link>
      {totals.count > 0 ? (
        <>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
            <div style={{ width: `${(pCal / macroTotal) * 100}%`, background: 'var(--color-mint)' }} />
            <div style={{ width: `${(cCal / macroTotal) * 100}%`, background: 'var(--color-butter)' }} />
            {/* Fat is lavender, not peach — the card itself is peach, so peach would disappear. */}
            <div style={{ width: `${(fCal / macroTotal) * 100}%`, background: 'var(--color-lavender)' }} />
          </div>
          <div className="text-ink-2 mt-2 flex gap-3 text-[11px] font-bold">
            <span>P {num(totals.protein)}g</span>
            <span>C {num(totals.carbs)}g</span>
            <span>F {num(totals.fat)}g</span>
            <span className="text-ink-3">· {totals.count} meals</span>
          </div>
        </>
      ) : (
        <p className="text-ink-3 mt-2 text-xs font-semibold">{NUTRITION.today.none}</p>
      )}
    </Card>
  );
}
