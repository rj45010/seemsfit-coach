import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'ink' | 'pink' | 'mint' | 'lavender' | 'butter' | 'surface';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantStyle: Record<Variant, { bg: string; fg: string }> = {
  ink: { bg: 'var(--color-ink)', fg: 'var(--color-paper)' },
  pink: { bg: 'var(--color-pink)', fg: 'var(--color-ink)' },
  mint: { bg: 'var(--color-mint)', fg: 'var(--color-ink)' },
  lavender: { bg: 'var(--color-lavender)', fg: 'var(--color-ink)' },
  butter: { bg: 'var(--color-butter)', fg: 'var(--color-ink)' },
  surface: { bg: 'var(--color-surface)', fg: 'var(--color-ink)' },
};

export function Button({
  variant = 'ink',
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  const v = variantStyle[variant];
  // `surface` shares the card colour, so give it a hairline border to keep it from
  // visually merging into a surface card behind it.
  const border = variant === 'surface' ? '1px solid color-mix(in srgb, var(--color-ink) 16%, transparent)' : undefined;
  return (
    <button
      className={`nb-btn inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold disabled:opacity-50 ${className}`}
      style={{ background: v.bg, color: v.fg, border, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
