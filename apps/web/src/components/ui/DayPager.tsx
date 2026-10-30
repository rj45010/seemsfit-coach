import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { todayKey, shiftDayKey, fmtDayKey } from '@/lib/date';

interface DayPagerProps {
  /** Selected day, `YYYY-MM-DD`. */
  dayKey: string;
  /** Fires with the new day and slide direction (+1 = newer, −1 = older). */
  onChange: (dayKey: string, dir: 1 | -1) => void;
  /** Latest selectable day; defaults to today so future days are blocked. */
  max?: string;
  className?: string;
}

/**
 * A cream date pager card: ‹ chevron · tappable date (opens the native picker to jump to any
 * past day) · chevron ›. Shared by the Sleep detail (`/trends/sleep`) and Nutrition day views so
 * both read identically; drop it anywhere a day needs stepping.
 */
export function DayPager({ dayKey, onChange, max = todayKey(), className }: DayPagerProps) {
  const atMax = dayKey >= max;
  const goOlder = () => onChange(shiftDayKey(dayKey, -1), -1);
  const goNewer = () => {
    if (!atMax) onChange(shiftDayKey(dayKey, 1), 1);
  };

  return (
    <Card accent="surface" className={cn('mb-3', className)}>
      <div className="flex items-center justify-between">
        <button onClick={goOlder} aria-label="Previous day" className="text-ink-2 hover:text-ink px-2 active:scale-90">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        {/* Tap the date to jump to any past day; the native picker sits invisibly on top. */}
        <div className="relative inline-flex">
          <p className="eyebrow px-2 underline decoration-dotted decoration-1 underline-offset-4">
            {dayKey >= todayKey() ? 'Today' : fmtDayKey(dayKey, 'EEE d MMM')}
          </p>
          <input
            type="date"
            aria-label="Pick a date"
            value={dayKey}
            max={max}
            onChange={(e) => {
              const v = e.target.value;
              if (!v || v > max) return;
              onChange(v, v > dayKey ? 1 : -1);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <button
          onClick={goNewer}
          aria-label="Next day"
          disabled={atMax}
          className="text-ink-2 hover:text-ink px-2 disabled:opacity-25 active:scale-90"
        >
          <ChevronRight size={22} strokeWidth={2.5} />
        </button>
      </div>
    </Card>
  );
}
