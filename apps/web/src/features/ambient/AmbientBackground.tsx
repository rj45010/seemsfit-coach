import { useEffect, useRef, useState } from 'react';
import { ParticleField } from './ParticleField';
import { MeshWash } from './MeshWash';
import { GrainOverlay } from './GrainOverlay';
import { useTilt } from './useTilt';
import { type AmbientTheme } from './config';

// Where the breathing glow sits, by page type: top (header/sun), bottom (warmth), center (halo).
const GLOW_POS: Record<NonNullable<AmbientTheme['glowAnchor']>, string> = {
  top: '130% 60% at 50% -12%',
  bottom: '130% 62% at 50% 112%',
  center: '95% 75% at 50% 42%',
};

// Slow drifts + a breathing glow, injected once. Transform/opacity only so they stay GPU-cheap.
// Three drift characters — omni (gentle roam), up (rising), diagonal (charged) — plus a deeper
// breath and a palette cross-fade used when the page theme changes.
const KEYFRAMES = `
@keyframes ambient-breathe { 0%,100%{opacity:.72;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
@keyframes ambient-breathe-deep { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.13)} }
@keyframes ambient-drift-1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(4%,-3%) scale(1.08)} }
@keyframes ambient-drift-2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5%,4%) scale(1.1)} }
@keyframes ambient-drift-3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(3%,5%) scale(1.06)} }
@keyframes ambient-up-1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(2%,-6%) scale(1.08)} }
@keyframes ambient-up-2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-3%,-7%) scale(1.1)} }
@keyframes ambient-up-3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(2%,-5%) scale(1.06)} }
@keyframes ambient-diag-1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(6%,6%) scale(1.1)} }
@keyframes ambient-diag-2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-6%,-5%) scale(1.12)} }
@keyframes ambient-diag-3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(7%,5%) scale(1.08)} }
@keyframes ambient-fadein { from{opacity:0} to{opacity:1} }
`;

/**
 * A calm, alive backdrop for a screen — the "aurora + grain" recipe. Layered back-to-front:
 *   • a breathing radial glow tinted by time of day;
 *   • a drifting mesh-wash of soft colour blobs (leans toward finger + tilt + scroll for parallax);
 *   • fine film grain over it all (the premium "physical paper" layer);
 *   • a few slow particles that scatter from touch.
 * Sits fixed behind content (z-index:-1, pointer-events:none) and pauses when backgrounded.
 * `theme` gives the palette + glow anchor — driven by page (and by time of day on Today).
 */
export function AmbientBackground({ theme }: { theme: AmbientTheme }) {
  const cfg = theme;
  const m = cfg.motion ?? {};
  const speed = m.speed ?? 1;
  const dir = m.dir ?? 'omni';
  const particleEnergy = m.particle ?? 1;
  const breatheDeep = (m.breathe ?? 1) >= 1.3;
  // A signature of the current palette — changing it remounts + cross-fades the colour layers so
  // navigating between page themes melts rather than pops.
  const paletteKey = `${cfg.glow}|${cfg.mesh.join(',')}|${cfg.glowAnchor ?? 'top'}`;
  const meshRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const scrollRef = useRef(0);
  const tilt = useTilt();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onScroll = () => { scrollRef.current = window.scrollY; };
    let clearActive = 0;
    const onMove = (cx: number, cy: number) => {
      pointerRef.current = { x: cx, y: cy, active: true };
      window.clearTimeout(clearActive);
      clearActive = window.setTimeout(() => { pointerRef.current.active = false; }, 900);
    };
    const onPointer = (e: PointerEvent) => onMove(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
    const onVis = () => setHidden(document.visibilityState === 'hidden');

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    // Parallax the colour wash toward finger + device tilt + scroll (transform only; over CSS drift).
    let raf = 0;
    let px = 0;
    let py = 0;
    const loop = () => {
      const p = pointerRef.current;
      const t = tilt.current;
      const tx = (p.active ? (p.x / window.innerWidth - 0.5) * 18 : 0) + t.x * 26;
      const ty = (p.active ? (p.y / window.innerHeight - 0.5) * 18 : 0) + t.y * 26;
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      const sy = scrollRef.current * 0.04; // slow depth parallax with the page
      if (meshRef.current) meshRef.current.style.transform = `translate3d(${px}px, ${py - sy}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onTouch);
      document.removeEventListener('visibilitychange', onVis);
      window.clearTimeout(clearActive);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Colour layers keyed by palette → on a page/theme change they remount and fade in (a soft
          cross-fade, since CSS can't tween a gradient's stops). */}
      <div key={paletteKey} style={{ position: 'absolute', inset: 0, animation: 'ambient-fadein 0.6s ease' }}>
        {/* breathing radial glow, anchored per page type */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(${GLOW_POS[cfg.glowAnchor ?? 'top']}, ${cfg.glow} 0%, transparent 62%)`,
            animation: `${breatheDeep ? 'ambient-breathe-deep 16s' : 'ambient-breathe 12s'} ease-in-out infinite`,
            transformOrigin: cfg.glowAnchor === 'bottom' ? '50% 100%' : cfg.glowAnchor === 'center' ? '50% 50%' : '50% 0%',
          }}
        />
        {/* drifting aurora mesh-wash (parallax wrapper) */}
        <div ref={meshRef} style={{ position: 'absolute', inset: '-6%', willChange: 'transform' }}>
          <MeshWash colors={cfg.mesh} speed={speed} dir={dir} />
        </div>
      </div>

      {/* fine film grain over the colour layers */}
      <GrainOverlay />

      {/* particles on top — the touch-reactive specks */}
      <ParticleField color={cfg.particle} pointerRef={pointerRef} scrollRef={scrollRef} paused={hidden} energy={particleEnergy} />
    </div>
  );
}
