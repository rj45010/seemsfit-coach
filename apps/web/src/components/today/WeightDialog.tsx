import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { range } from '@/components/ui/NumberPicker';
import { useLogWeight } from '@/hooks/useMetrics';

const KG = range(30, 250, 0.5);
const FAT = range(3, 60, 0.5);

export function WeightDialog({
  currentKg,
  onClose,
}: {
  currentKg?: number;
  onClose: () => void;
}) {
  const log = useLogWeight();
  const [kg, setKg] = useState(currentKg != null ? String(currentKg) : '');
  const [fat, setFat] = useState('');

  async function save() {
    const weightKg = parseFloat(kg);
    if (!Number.isFinite(weightKg)) return;
    await log.mutateAsync({
      weightKg,
      bodyFatPct: fat.trim() ? parseFloat(fat) : undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center" onClick={onClose}>
      <Card accent="surface" className="w-full max-w-sm" animate={false}>
        <div onClick={(e) => e.stopPropagation()}>
          <p className="eyebrow mb-3">Log weight · today</p>
          <div className="flex flex-col gap-2">
            <label className="text-ink-2 text-xs font-bold">Weight (kg)</label>
            <NumberField value={kg} onChange={setKg} options={KG} title="Weight" unit="kg" placeholder="e.g. 74.5" />
            <label className="text-ink-2 mt-1 text-xs font-bold">Body fat % (optional)</label>
            <NumberField value={fat} onChange={setFat} options={FAT} title="Body fat" unit="%" placeholder="e.g. 18" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ink" onClick={save} disabled={log.isPending || !kg.trim()}>
              {log.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="surface" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
