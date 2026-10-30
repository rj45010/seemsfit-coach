import type { AmbientMotion } from './config';

// Aurora mesh-wash: a few big, soft, blurred colour blobs that drift slowly on independent
// timelines — the "alive" base coat. Colours + motion (speed/direction) come from the page theme.
// Pure CSS drift (transform only, GPU-composited); the parallax lean toward finger/tilt/scroll is
// applied by the parent wrapper. Keyframes ambient-{drift,up,diag}-1..3 are injected by AmbientBackground.
// Spread down the whole viewport (not pooled at the top) so cards at every scroll depth catch colour.
const BLOBS = [
  { top: '-14%', left: '-12%', w: '82vw', h: '58vh', dur: 24, k: 1 },
  { top: '18%', left: '34%', w: '76vw', h: '56vh', dur: 30, k: 2 },
  { top: '52%', left: '-10%', w: '80vw', h: '60vh', dur: 27, k: 3 },
  { top: '80%', left: '30%', w: '78vw', h: '58vh', dur: 33, k: 2 },
];

const PREFIX: Record<NonNullable<AmbientMotion['dir']>, string> = {
  omni: 'ambient-drift',
  up: 'ambient-up',
  diagonal: 'ambient-diag',
};

export function MeshWash({
  colors,
  speed = 1,
  dir = 'omni',
}: {
  colors: [string, string, string];
  speed?: number;
  dir?: AmbientMotion['dir'];
}) {
  const prefix = PREFIX[dir ?? 'omni'];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: b.top,
            left: b.left,
            width: b.w,
            height: b.h,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 50%, ${colors[i % colors.length]} 0%, transparent 68%)`,
            filter: 'blur(46px)',
            willChange: 'transform',
            animation: `${prefix}-${b.k} ${(b.dur * speed).toFixed(1)}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
