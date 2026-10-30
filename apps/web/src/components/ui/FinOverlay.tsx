import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

/** Neo-brutalist accent palette + ink, reused for the confetti. */
const COLORS = [
  'var(--color-pink)',
  'var(--color-mint)',
  'var(--color-lavender)',
  'var(--color-butter)',
  'var(--color-peach)',
  'var(--color-sky)',
  'var(--color-ink)',
];

interface Particle {
  startX: number; // vw, where it launches along the bottom edge
  driftX: number; // px horizontal drift during flight
  rise: number; // px it shoots up (negative y)
  rotate: number;
  size: number;
  color: string;
  round: boolean;
  delay: number;
  duration: number;
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, () => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      startX: Math.random() * 100,
      driftX: (Math.random() - 0.5) * 220,
      rise: vh * (0.45 + Math.random() * 0.5),
      rotate: (Math.random() - 0.5) * 720,
      size: 7 + Math.random() * 9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() > 0.5,
      delay: Math.random() * 0.15,
      duration: 1 + Math.random() * 0.7,
    };
  });
}

/**
 * CRED-style success blast: a big centered "Fin." with confetti shooting up
 * from the bottom edge. Auto-dismisses; renders nothing interactive
 * (pointer-events-none) so it never blocks the UI underneath.
 */
export function FinOverlay({ onDone, big = 'Fin.', sub }: { onDone: () => void; big?: string; sub?: string }) {
  const hasSub = !!sub;
  const particles = useMemo(() => makeParticles(hasSub ? 130 : 90), [hasSub]);

  useEffect(() => {
    const t = setTimeout(onDone, hasSub ? 2800 : 1700);
    return () => clearTimeout(t);
  }, [onDone, hasSub]);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-[var(--color-paper)]/65 backdrop-blur-[2px]" />

      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0"
          style={{
            left: `${p.startX}vw`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ y: 0, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: -p.rise, x: p.driftX, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut', times: [0, 0.75, 1] }}
        />
      ))}

      <motion.div
        className="relative px-6 text-center"
        style={{ color: 'var(--color-ink)' }}
        initial={{ scale: 0.4, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 17 }}
      >
        <p className="text-7xl font-extrabold uppercase tracking-tight">{big}</p>
        {sub && <p className="mt-2 text-sm font-bold leading-snug">{sub}</p>}
      </motion.div>
    </motion.div>
  );
}
