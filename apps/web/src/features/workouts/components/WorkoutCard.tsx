import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { catMeta } from '@/lib/workoutMeta';
import { iconForType } from '@/lib/workoutTypes';
import { duration as fmtDur, km, kcal } from '@/lib/format';
import { fmtDate } from '@/lib/date';
import { tapMedium } from '@/lib/haptics';
import type { Workout } from '@/lib/types';
import { useDeleteWorkout } from '../api/useWorkouts';

const REVEAL = 92; // px the row slides to expose the delete action
const SNAP = { type: 'spring' as const, stiffness: 520, damping: 42 };

/** A history row that swipes left to reveal Delete (native iOS style); tap opens the detail. */
export function WorkoutCard({ w, delay = 0 }: { w: Workout; delay?: number }) {
  const { icon: catIcon, accent } = catMeta(w.category);
  const Icon = iconForType(w.sport) ?? catIcon;
  const date = w.customDate ?? w.createdAt;
  const del = useDeleteWorkout();

  // Drive everything off ONE motion value so nothing re-renders mid-swipe (that was the jitter).
  const x = useMotionValue(0);
  // The circular button fades AND scales up as the row slides — so it "comes up" smoothly like the
  // native swipe action, and at rest (0) it's invisible so it can't bleed through the glass.
  const delOpacity = useTransform(x, [-REVEAL, -REVEAL * 0.4, 0], [1, 0.7, 0]);
  const delScale = useTransform(x, [-REVEAL, -REVEAL * 0.4, 0], [1, 0.72, 0.4]);
  const openRef = useRef(false);

  const remove = async () => {
    tapMedium();
    try {
      await del.mutateAsync(w.id);
    } catch {
      animate(x, 0, SNAP);
      openRef.current = false;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[24px]">
      <motion.button
        onClick={remove}
        aria-label="Delete workout"
        className="absolute inset-y-0 right-0 flex items-center justify-center"
        style={{ width: REVEAL, opacity: delOpacity }}
      >
        {/* Circular iOS-style button (matches the native Vyom circular buttons), not a full bar. */}
        <motion.span
          className="flex h-11 w-11 items-center justify-center rounded-full shadow-md"
          style={{ background: 'var(--color-sys-red)', scale: delScale }}
        >
          <Trash2 size={20} strokeWidth={2.5} className="text-white" />
        </motion.span>
      </motion.button>

      <motion.div
        drag="x"
        dragDirectionLock
        style={{ x, touchAction: 'pan-y' }}
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const shouldOpen = info.offset.x < -REVEAL / 2 || info.velocity.x < -450;
          animate(x, shouldOpen ? -REVEAL : 0, SNAP);
          openRef.current = shouldOpen;
        }}
      >
        <Link
          to={`/workouts/${w.id}`}
          className="block"
          onClick={(e) => {
            if (openRef.current) { e.preventDefault(); animate(x, 0, SNAP); openRef.current = false; }
          }}
        >
          <Card accent={accent} delay={delay} className="transition-opacity active:opacity-70">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sys-fill">
                <Icon size={20} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{w.title || w.sport || w.category}</p>
                <p className="text-ink-2 text-xs font-semibold">{fmtDate(date)}</p>
              </div>
              <div className="text-right">
                <p className="big-number text-xl">{fmtDur(w.duration)}</p>
                <p className="text-ink-2 text-[11px] font-semibold">
                  {w.distance ? `${km(w.distance)} km` : w.calories ? `${kcal(w.calories)} kcal` : w.category}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </motion.div>
    </div>
  );
}
