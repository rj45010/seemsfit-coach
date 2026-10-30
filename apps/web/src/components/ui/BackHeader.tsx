import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export function BackHeader({ to, label = 'Back' }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  // Prefer real history-back so the previous screen's scroll position is
  // restored; fall back to `to` only on a cold deep-link with no history.
  const idx = (window.history.state?.idx as number | undefined) ?? 0;
  const goBack = () => (idx > 0 ? navigate(-1) : navigate(to ?? '/'));
  return (
    <button
      onClick={goBack}
      className="mb-4 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)] px-3.5 py-2 text-xs font-semibold transition-opacity duration-100 active:opacity-60"
    >
      <ChevronLeft size={15} strokeWidth={2.5} />
      {label}
    </button>
  );
}
