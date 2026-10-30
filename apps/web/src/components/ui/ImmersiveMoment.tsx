import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ParticleField } from '@/features/ambient';

/**
 * A full-screen immersive "moment" — warm cream, softly lit with drifting touch-reactive dust and
 * big type. Used for the morning briefing, workout detail, and the info popovers. Matches the app's
 * cream theme (dark ink), so the OS status bar (dark content) already fits. Tap anywhere (or ✕) to
 * dismiss. Wrap the caller in <AnimatePresence>.
 *
 * Pass `title`/`body`/`points` for the standard layout, or `children` for arbitrary content (e.g.
 * the info explainers). `title` is optional so children-only moments work too.
 */
export function ImmersiveMoment({
  eyebrow,
  title,
  body,
  points,
  children,
  onClose,
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
  points?: string[];
  children?: ReactNode;
  onClose: () => void;
}) {
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const scrollRef = useRef(0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      onClick={onClose}
      onPointerMove={(e) => { pointerRef.current = { x: e.clientX, y: e.clientY, active: true }; }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'radial-gradient(120% 90% at 50% 8%, #fbf8f1 0%, #ece4d4 72%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 28px',
        overflowY: 'auto',
      }}
    >
      {/* warm bloom + drifting, touch-reactive dust */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(85% 55% at 50% 4%, rgba(219,155,130,0.22), transparent 60%)' }} />
        <ParticleField color="#c99a3f" pointerRef={pointerRef} scrollRef={scrollRef} paused={false} energy={1.4} />
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="text-ink-2"
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', right: 20 }}
      >
        <X size={22} strokeWidth={2.5} />
      </button>

      <div style={{ position: 'relative', zIndex: 1 }} className="py-16">
        {eyebrow && <p className="eyebrow text-ink-3">{eyebrow}</p>}
        {title && <h1 className="display text-ink mt-2.5 mb-4 text-[2rem] leading-[1.14]">{title}</h1>}
        {body && <p className="text-ink-2 text-[0.95rem] font-medium leading-relaxed">{body}</p>}
        {points && points.length > 0 && (
          <ul className="mt-3.5 flex flex-col gap-2">
            {points.map((p, i) => (
              <li key={i} className="text-ink-2 text-sm font-semibold">· {p}</li>
            ))}
          </ul>
        )}
        {children && <div className="text-ink-2 flex flex-col gap-3 text-sm font-medium leading-relaxed">{children}</div>}
        <p className="text-ink-3 mt-7 text-[0.72rem] font-bold">Tap anywhere to close</p>
      </div>
    </motion.div>
  );
}
