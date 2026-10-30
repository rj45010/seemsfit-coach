// Fine film grain — the "premium" layer. A single inline SVG fractal-noise tile, repeated and held
// at a whisper opacity so flat color reads as physical paper rather than a screen fill. Static (no
// animation), GPU-cheap: one repeating background-image, no canvas, no per-frame work.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function GrainOverlay({ opacity = 0.09 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: NOISE,
        backgroundSize: '140px 140px',
        opacity,
        mixBlendMode: 'soft-light',
        pointerEvents: 'none',
      }}
    />
  );
}
