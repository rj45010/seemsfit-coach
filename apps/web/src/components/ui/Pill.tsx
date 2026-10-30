import type { ReactNode } from 'react';

type Tone = 'ink' | 'pink' | 'mint' | 'lavender' | 'butter' | 'peach' | 'sky' | 'surface';

const toneBg: Record<Tone, string> = {
  ink: 'var(--color-ink)',
  pink: 'var(--color-pink)',
  mint: 'var(--color-mint)',
  lavender: 'var(--color-lavender)',
  butter: 'var(--color-butter)',
  peach: 'var(--color-peach)',
  sky: 'var(--color-sky)',
  surface: 'var(--color-surface)',
};

export function Pill({
  tone = 'surface',
  active = false,
  onClick,
  children,
}: {
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-opacity duration-100 active:opacity-60 disabled:cursor-default"
      style={{
        background: active ? toneBg[tone] : 'var(--color-sys-fill)',
        color: tone === 'ink' && active ? 'var(--color-paper)' : 'var(--color-ink)',
      }}
    >
      {children}
    </button>
  );
}
