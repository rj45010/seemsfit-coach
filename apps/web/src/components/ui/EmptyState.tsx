import type { ReactNode } from 'react';
import { Card } from './Card';

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card accent="butter" className="flex flex-col items-center gap-3 py-9 text-center">
      {icon && <div className="text-[var(--color-ink)]">{icon}</div>}
      <p className="display text-lg">{title}</p>
      {hint && <p className="max-w-xs text-sm font-medium text-[var(--color-ink-2)]">{hint}</p>}
    </Card>
  );
}
