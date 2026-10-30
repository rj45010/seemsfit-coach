import { useMemo } from 'react';

type Phase = 'morning' | 'day' | 'evening' | 'night';

function phaseNow(d = new Date()): Phase {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 20) return 'evening';
  return 'night';
}

// Warm dawn → bright day → rose dusk → cool night. Subtle so the greeting text stays crisp.
const SUN: Record<Exclude<Phase, 'night'>, { color: string; glow: string }> = {
  morning: { color: '#f0a95a', glow: 'rgba(240,169,90,0.45)' },
  day: { color: '#f2c24f', glow: 'rgba(242,194,79,0.42)' },
  evening: { color: '#e07f52', glow: 'rgba(224,127,82,0.45)' },
};

const KEYFRAMES = `
@keyframes ts-rise { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes ts-rays { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes ts-bird { 0% { transform: translateX(-30px) } 100% { transform: translateX(150px) } }
@keyframes ts-flap { 0%, 100% { transform: scaleY(1) } 50% { transform: scaleY(0.45) } }
@keyframes ts-twinkle { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
@keyframes ts-drift { 0% { transform: translateX(0) } 100% { transform: translateX(-16px) } }
`;

/** A small animated time-of-day vignette for the header band: rising sun + birds in the morning,
 *  rayed sun midday, setting sun at dusk, crescent moon + stars at night. Decorative, low-opacity. */
/** Push an element below the status-bar safe area so it clears the clock/battery. */
const safeTop = (n: number) => `calc(env(safe-area-inset-top) + ${n}px)`;

export function TimeScene() {
  const phase = useMemo(() => phaseNow(), []);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNight = phase === 'night';
  const sun = isNight ? null : SUN[phase];

  return (
    <div
      aria-hidden
      style={{
        // Fill to the very top so the glow bleeds up BEHIND the status bar (no hard cut); the
        // sun/moon/stars themselves are offset below the safe area so they clear the clock.
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 1,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* soft glow behind the sun/moon — starts above the screen top so it bleeds up behind the
          status bar (no hard cut) and reaches down to the sun/moon below the safe area. */}
      <div
        style={{
          position: 'absolute',
          top: -40,
          right: -20,
          width: 240,
          height: 220,
          background: `radial-gradient(58% 58% at 70% 55%, ${isNight ? 'rgba(96,104,140,0.42)' : sun!.glow} 0%, transparent 72%)`,
        }}
      />

      {isNight ? (
        <>
          {/* crescent moon (a disc with an offset cut-out disc) — deep slate so it reads on cream */}
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: 'absolute', top: safeTop(2), right: 14 }}>
            <defs>
              <mask id="ts-moon"><rect width="56" height="56" fill="white" /><circle cx="36" cy="23" r="18" fill="black" /></mask>
            </defs>
            <circle cx="28" cy="28" r="18" fill="#4b5170" mask="url(#ts-moon)" />
          </svg>
          {/* twinkling stars — muted indigo, larger, so they show on the light background */}
          {[[30, 42], [72, 18], [118, 50], [160, 26], [210, 44]].map(([x, y], i) => (
            <span
              key={i}
              style={{
                position: 'absolute', left: x, top: safeTop(y), width: 5, height: 5, borderRadius: '50%',
                background: '#565d7e',
                animation: reduce ? undefined : `ts-twinkle ${2.4 + i * 0.5}s ease-in-out ${i * 0.4}s infinite`,
              }}
            />
          ))}
        </>
      ) : (
        <>
          {/* sun (rays slowly rotate on the bright day; morning it rises in) */}
          <div
            style={{
              position: 'absolute', top: safeTop(phase === 'day' ? 2 : 8), right: 20,
              animation: reduce ? undefined : phase === 'morning' ? 'ts-rise 1.6s ease-out' : undefined,
            }}
          >
            <svg width="58" height="58" viewBox="0 0 58 58">
              <g
                stroke={sun!.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                style={{ transformOrigin: '29px 29px', animation: reduce ? undefined : 'ts-rays 60s linear infinite', opacity: 0.85 }}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <line key={i} x1="29" y1="4" x2="29" y2="12" transform={`rotate(${i * 45} 29 29)`} />
                ))}
              </g>
              <circle cx="29" cy="29" r="13" fill={sun!.color} />
            </svg>
          </div>

          {/* morning birds — small chevrons drifting across with a wing flap */}
          {phase === 'morning' &&
            [[6, 0.9], [42, 1.3], [22, 1.1]].map(([top, dur], i) => (
              <div
                key={i}
                style={{
                  position: 'absolute', top: safeTop(top), left: 0,
                  animation: reduce ? undefined : `ts-bird ${16 + i * 3}s linear ${i * 2.5}s infinite`,
                }}
              >
                <svg width="14" height="8" viewBox="0 0 14 8" style={{ animation: reduce ? undefined : `ts-flap ${dur}s ease-in-out infinite` }}>
                  <path d="M1 6 Q4 1 7 5 Q10 1 13 6" fill="none" stroke="rgba(70,56,40,0.5)" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
            ))}

          {/* a lone drifting cloud wisp at midday */}
          {phase === 'day' && (
            <div style={{ position: 'absolute', top: 40, left: 40, animation: reduce ? undefined : 'ts-drift 9s ease-in-out infinite alternate' }}>
              <svg width="60" height="18" viewBox="0 0 60 18">
                <path d="M8 14 Q8 6 18 7 Q22 2 30 6 Q40 4 42 11 Q52 10 50 14 Z" fill="rgba(70,56,40,0.08)" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}
