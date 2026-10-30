import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useBurstToken } from '@/lib/burst';

// Warm gold "dust" — the Meta-AI-style shimmer.
const GOLD = ['#f5c451', '#ffb765', '#ffd98a', '#e8a33d', '#fff0c2'];

interface Speck {
  x: number; // px from centre
  y: number;
  r: number;
  color: string;
  dur: number;
  delay: number;
}

function makeSpecks(n: number): Speck[] {
  return Array.from({ length: n }, () => {
    const ang = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 170;
    return {
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 40, // bias slightly upward
      r: 2 + Math.random() * 4,
      color: GOLD[Math.floor(Math.random() * GOLD.length)],
      dur: 0.8 + Math.random() * 0.7,
      delay: Math.random() * 0.08,
    };
  });
}

/**
 * App-wide gold dust-burst played on small wins (meal/workout logged). Mounted once; replays each
 * time `burst()` is called. Fixed, non-interactive, above content. Honours reduced-motion (skips).
 */
export function BurstOverlay() {
  const token = useBurstToken();
  const reduce = useReducedMotion();
  const [specks, setSpecks] = useState<Speck[] | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; } // ignore the initial token (0)
    if (reduce) return;
    setSpecks(makeSpecks(28));
    const t = window.setTimeout(() => setSpecks(null), 1700);
    return () => window.clearTimeout(t);
  }, [token, reduce]);

  if (!specks) return null;
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', display: 'grid', placeItems: 'center' }}
    >
      {specks.map((s, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0], x: s.x, y: s.y, scale: 1 }}
          transition={{ duration: s.dur, delay: s.delay, ease: 'easeOut' }}
          style={{
            gridArea: '1 / 1', // all start at the centre
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: '50%',
            background: s.color,
            boxShadow: `0 0 ${s.r * 3}px ${s.color}`,
          }}
        />
      ))}
    </div>
  );
}
