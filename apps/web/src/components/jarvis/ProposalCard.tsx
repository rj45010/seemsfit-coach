import { useState } from 'react';
import { Check, X, Wand2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { actionLabel, type ProposedAction } from '@/lib/jarvisActions';

type State = 'idle' | 'applying' | 'applied' | 'dismissed' | 'error';

export function ProposalCard({
  action,
  onApply,
}: {
  action: ProposedAction;
  onApply: (a: ProposedAction) => Promise<void>;
}) {
  const [state, setState] = useState<State>('idle');

  async function apply() {
    setState('applying');
    try {
      await onApply(action);
      setState('applied');
    } catch {
      setState('error');
    }
  }

  return (
    <Card accent="mint" animate={false} className="py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Wand2 size={13} strokeWidth={2.5} />
        <span className="eyebrow">Vyom proposes</span>
      </div>
      <p className="text-sm font-bold">{actionLabel(action)}</p>
      <p className="text-ink-2 text-xs font-medium">{action.summary}</p>

      {state === 'idle' && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={apply}
            className="nb-btn bg-ink text-paper flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
          >
            <Check size={13} strokeWidth={3} /> Apply
          </button>
          <button
            onClick={() => setState('dismissed')}
            className="nb-btn text-ink flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
            style={{ background: 'color-mix(in srgb, var(--color-ink) 8%, transparent)' }}
          >
            <X size={13} strokeWidth={3} /> Dismiss
          </button>
        </div>
      )}
      {state === 'applying' && <p className="mt-2 text-xs font-bold">Applying…</p>}
      {state === 'applied' && (
        <p className="mt-2 flex items-center gap-1 text-xs font-bold">
          <Check size={13} strokeWidth={3} /> Applied
        </p>
      )}
      {state === 'dismissed' && <p className="text-ink-3 mt-2 text-xs font-bold">Dismissed</p>}
      {state === 'error' && <p className="text-crit mt-2 text-xs font-bold">Couldn't apply — try again</p>}
    </Card>
  );
}
