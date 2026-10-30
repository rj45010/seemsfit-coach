import { GlassWater, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useTodayMetrics, useSetWater } from '@/hooks/useMetrics';
import { tapLight } from '@/lib/haptics';
import { num } from '@/lib/format';

const ML_PER_GLASS = 250;

export function WaterCard() {
  const { data: today } = useTodayMetrics();
  const setWater = useSetWater();
  const glasses = today?.waterGlasses ?? 0;

  const set = (n: number) => {
    tapLight();
    setWater.mutate(Math.max(0, n));
  };

  return (
    <Card accent="sky" className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sys-fill">
            <GlassWater size={24} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Water</p>
            <p className="big-number mt-0.5 text-3xl leading-none">
              {glasses} <span className="text-ink-2 text-sm font-bold">{glasses === 1 ? 'glass' : 'glasses'}</span>
            </p>
            <p className="text-ink-2 mt-1 text-xs font-semibold">
              {num((glasses * ML_PER_GLASS) / 1000, 2)} L · 1 glass = {ML_PER_GLASS}ml
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => set(glasses - 1)}
            disabled={glasses <= 0}
            aria-label="Remove a glass"
            className="text-ink flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] transition-transform disabled:opacity-40 active:scale-95"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
          <button
            onClick={() => set(glasses + 1)}
            aria-label="Add a glass"
            className="bg-ink text-paper flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>
      </div>
    </Card>
  );
}
