import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useMemory, useForgetFact, useSaveInstructions } from '@/hooks/useMemory';

/** Jarvis's brain: standing instructions (applied every reply) + remembered facts. */
export function MemorySheet({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useMemory();
  const forget = useForgetFact();
  const saveInstructions = useSaveInstructions();

  const [instructions, setInstructions] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) setInstructions(data.instructions);
  }, [data]);

  async function save() {
    await saveInstructions.mutateAsync(instructions.trim());
    setDirty(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:items-center" onClick={onClose}>
      <Card accent="surface" animate={false} className="max-h-[85vh] w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <p className="display text-lg">Vyom memory</p>
            <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink">
              <X size={18} strokeWidth={3} />
            </button>
          </div>

          {/* Standing instructions */}
          <p className="eyebrow mb-1">Your instructions</p>
          <p className="text-ink-3 mb-2 text-[11px] font-semibold">
            Applied to every reply — e.g. "be blunt", "keep it short", "I'm vegetarian", "use kg".
          </p>
          <textarea
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              setDirty(true);
            }}
            rows={3}
            placeholder="Add standing instructions for Vyom…"
            className="w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender"
          />
          {dirty && (
            <Button variant="ink" className="mt-2" onClick={save} disabled={saveInstructions.isPending}>
              {saveInstructions.isPending ? 'Saving…' : 'Save instructions'}
            </Button>
          )}

          {/* Remembered facts */}
          <p className="eyebrow mt-5 mb-2">What Vyom remembers</p>
          {isLoading ? (
            <p className="text-ink-3 text-sm font-semibold">Loading…</p>
          ) : !data || data.facts.length === 0 ? (
            <p className="text-ink-2 text-sm font-medium leading-relaxed">
              Nothing yet. Tell Vyom something durable — "my left knee gets sore on squats" — and it'll
              keep it here and work around it.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.facts.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-2 rounded-2xl bg-sys-fill-2 p-3">
                  <span className="text-sm font-medium leading-snug">{f.text}</span>
                  <button
                    onClick={() => forget.mutate(f)}
                    disabled={forget.isPending}
                    aria-label="Forget this"
                    className="text-ink-3 hover:text-crit shrink-0"
                  >
                    <Trash2 size={15} strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
