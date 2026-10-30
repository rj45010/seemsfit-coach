import { motion } from 'framer-motion';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type Accent = 'surface' | 'pink' | 'mint' | 'lavender' | 'butter' | 'peach' | 'sky';
type Variant = 'glass' | 'solid';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  accent?: Accent;
  /** 'glass' (default) = frosted Liquid Glass surface; 'solid' = opaque
   *  --color-surface card. Use 'solid' for dense lists / chart backdrops where
   *  per-frame blur hurts perf or hurts chart legibility. */
  variant?: Variant;
  animate?: boolean;
  delay?: number;
  children: ReactNode;
}

// The curated pastel per accent (solid, opaque) — a coloured card is one of these blocks with dark
// ink on top. `surface` = the neutral cream card. Change the tokens in globals.css to re-theme.
const accentSolid: Record<Accent, string> = {
  surface: 'var(--color-surface)',
  pink: 'var(--color-pink)',
  mint: 'var(--color-mint)',
  lavender: 'var(--color-lavender)',
  butter: 'var(--color-butter)',
  peach: 'var(--color-peach)',
  sky: 'var(--color-sky)',
};

export function Card({
  accent = 'surface',
  variant = 'glass',
  animate = true,
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}: CardProps) {
  const isAccent = accent !== 'surface';

  // Accent cards are SOLID pastel blocks (dark ink); `surface` is the neutral card (frosted glass,
  // or opaque surface when variant='solid'). Radius/shadow are shared so blocks feel chunky + soft.
  let classes: string;
  let mergedStyle: CSSProperties;
  if (isAccent) {
    classes = `p-5 ${className}`;
    mergedStyle = {
      background: accentSolid[accent],
      color: 'var(--color-ink)',
      borderRadius: 'var(--glass-radius)',
      boxShadow: 'var(--shadow-2)',
      ...style,
    };
  } else {
    const isGlass = variant === 'glass';
    classes = `${isGlass ? 'glass' : 'nb-card'} p-5 ${className}`;
    mergedStyle = { ...(isGlass ? {} : { background: 'var(--color-surface)' }), ...style };
  }

  if (!animate) {
    return (
      <div className={classes} style={mergedStyle} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={classes}
      style={mergedStyle}
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut', delay }}
      // Tactile press: a subtle spring dip so cards feel physical when tapped.
      whileTap={{ scale: 0.985 }}
      {...(rest as object)}
    >
      {children}
    </motion.div>
  );
}
