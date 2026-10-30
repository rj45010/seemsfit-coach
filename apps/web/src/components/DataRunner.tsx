import { useEffect, useState } from 'react';

/**
 * A small running figure whose body is "made of data" — each filled cell shows a
 * flickering character, and the pose alternates between two frames for a run cycle.
 * Signifies a data-driven app while the skeleton syncs. Small by design.
 */
const FRAMES = [
  [
    '...##...',
    '...##...',
    '.######.',
    '#..##...',
    '...##...',
    '..#..#..',
    '.#....#.',
    '#......#',
  ],
  [
    '...##...',
    '...##...',
    '.######.',
    '#..##...',
    '...##...',
    '...##...',
    '..#..#..',
    '.#....#.',
  ],
];
const CHARS = '01$#X=~7';

/**
 * Renders a word where each letter randomly flickers into a "data" glyph and back,
 * so the label reads as real text but feels like it's being assembled from data.
 */
export function DataText({ text, className = '' }: { text: string; className?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 110);
    return () => clearInterval(id);
  }, []);
  // Re-read tick so the render re-runs; pick ~1-2 letters to scramble each tick.
  void tick;
  return (
    <span className={`font-mono font-bold tracking-wide select-none ${className}`}>
      {[...text].map((ch) =>
        ch !== ' ' && Math.random() < 0.18 ? CHARS[Math.floor(Math.random() * CHARS.length)] : ch,
      ).join('')}
    </span>
  );
}

export function DataRunner() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);

  const frame = FRAMES[Math.floor(tick / 2) % FRAMES.length];
  const rnd = () => CHARS[Math.floor(Math.random() * CHARS.length)];

  return (
    <pre className="text-ink-2 m-0 text-center font-mono text-[11px] leading-[1.05] font-bold select-none">
      {frame.map((row, i) => (
        <div key={i}>{[...row].map((c) => (c === '#' ? rnd() : ' ')).join('')}</div>
      ))}
    </pre>
  );
}
