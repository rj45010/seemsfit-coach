import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Card } from './Card';

type Accent = 'surface' | 'pink' | 'mint' | 'lavender' | 'butter' | 'peach' | 'sky';

/**
 * A Card whose `summary` row is always visible and taps to reveal `children` in
 * place (height-collapse animation matched to RecoveryStrain). Presentational —
 * no data of its own. Used for the Recovery / Sleep snapshot cards on Health.
 */
export function ExpandableCard({
  summary,
  children,
  accent = 'surface',
  delay = 0,
  defaultOpen = false,
  ariaLabel,
}: {
  summary: ReactNode;
  children: ReactNode;
  accent?: Accent;
  delay?: number;
  defaultOpen?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card accent={accent} delay={delay}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-3 text-left transition-transform active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown
          size={20}
          strokeWidth={2.5}
          className="text-ink-3 shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
