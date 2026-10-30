import { tapLight } from '@/lib/haptics';
import type { Rating } from '@/lib/types';

const VALUES: Rating[] = [1, 2, 3, 4, 5];

export function RatingRow({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value?: Rating;
  accent: string;
  onChange: (v: Rating) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex gap-1.5">
        {VALUES.map((v) => (
          <button
            key={v}
            onClick={() => { tapLight(); onChange(v); }}
            className="h-9 w-9 rounded-xl font-mono text-xs font-semibold transition-transform duration-100 active:scale-95"
            style={{
              background: value === v ? accent : 'color-mix(in srgb, var(--color-ink) 6%, transparent)',
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
