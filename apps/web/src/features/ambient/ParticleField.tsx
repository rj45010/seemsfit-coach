import { useEffect, useRef, type RefObject } from 'react';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; a: number }

/**
 * A few slow-drifting soft specks on a canvas. They react to touch (gently pushed away from
 * the finger) and to scroll (a light vertical drift), then settle. Capped count + rAF, paused
 * when backgrounded, disabled entirely for prefers-reduced-motion. Purely decorative.
 */
export function ParticleField({
  color,
  pointerRef,
  scrollRef,
  paused,
  energy = 1,
}: {
  color: string;
  pointerRef: RefObject<{ x: number; y: number; active: boolean }>;
  scrollRef: RefObject<number>;
  paused: boolean;
  /** Count + velocity multiplier per page (Train livelier, Health/Profile quieter). Default 1. */
  energy?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let lastScroll = scrollRef.current ?? 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Scale count with area (modest), then by page energy.
      const count = Math.round(Math.min(28, Math.max(12, (w * h) / 42000)) * energy);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12 * energy,
        vy: (-0.05 - Math.random() * 0.12) * energy,
        r: 1 + Math.random() * 1.8,
        a: 0.15 + Math.random() * 0.3,
      }));
    };

    const frame = () => {
      const cur = scrollRef.current ?? 0;
      const scrollDelta = cur - lastScroll;
      lastScroll = cur;
      const p = pointerRef.current;

      ctx.clearRect(0, 0, w, h);
      for (const s of particles) {
        s.x += s.vx;
        s.y += s.vy + scrollDelta * 0.06; // drift with scroll, then settle

        // gentle push away from the finger
        if (p?.active) {
          const dx = s.x - p.x;
          const dy = s.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 9000 && d2 > 0.1) {
            const f = (9000 - d2) / 9000 / Math.sqrt(d2);
            s.x += dx * f * 1.4;
            s.y += dy * f * 1.4;
          }
        }

        // wrap around edges
        if (s.x < -5) s.x = w + 5;
        else if (s.x > w + 5) s.x = -5;
        if (s.y < -5) s.y = h + 5;
        else if (s.y > h + 5) s.y = -5;

        ctx.beginPath();
        ctx.globalAlpha = s.a;
        ctx.fillStyle = color;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [color, pointerRef, scrollRef, energy]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="ambient-particles"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: paused ? 0 : 1, transition: 'opacity 0.4s' }}
    />
  );
}
