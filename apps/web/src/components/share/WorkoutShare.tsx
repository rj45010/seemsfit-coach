import { useMemo, useRef, useState } from 'react';
import { Share2, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { SHARE_TEMPLATES, buildCtx, type ShareInk } from './templates';
import { shareOrDownloadPng } from '@/lib/shareImage';
import type { Workout } from '@/lib/types';

export function WorkoutShare({ workout }: { workout: Workout }) {
  const [open, setOpen] = useState(false);
  const [ink, setInk] = useState<ShareInk>('white');
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState(workout.notes ?? '');
  const [editing, setEditing] = useState(false);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const ctx = useMemo(() => buildCtx(workout, ink, note), [workout, ink, note]);

  async function download(id: string) {
    const node = refs.current[id];
    if (!node) return;
    setBusy(id);
    try {
      const date = (workout.customDate ?? '').slice(0, 10) || 'activity';
      await shareOrDownloadPng(node, `seemsfit-${id}-${date}`, transparent ? null : cardBg);
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <Button variant="surface" className="mt-4" onClick={() => setOpen(true)}>
        <Share2 size={15} strokeWidth={2.5} /> Share card
      </Button>
    );
  }

  // 'white' = white text on a dark card, 'black' = dark text on a light card.
  // Transparent toggle exports a PNG with no card fill (text/graphics only).
  const cardBg = ink === 'white' ? '#212124' : '#faf7f2';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={() => setOpen(false)}>
      <div
        className="bg-surface safe-bottom flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[28px] md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-ink-3 mx-auto mt-3 h-1 w-9 rounded-full opacity-50 md:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <p className="eyebrow">Share card</p>
          <div className="flex items-center gap-2">
            <Pill tone="ink" active={ink === 'white'} onClick={() => setInk('white')}>Dark</Pill>
            <Pill tone="ink" active={ink === 'black'} onClick={() => setInk('black')}>Light</Pill>
            <Pill tone="ink" active={transparent} onClick={() => setTransparent((v) => !v)}>Clear</Pill>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-ink ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] transition-opacity active:opacity-60"
            >
              <X size={16} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          <div className="flex flex-col gap-4">
            {SHARE_TEMPLATES.map((t) => (
              <div key={t.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-ink-2 text-xs font-bold">{t.label}</span>
                  <div className="flex items-center gap-3">
                    {t.id === 'bubble-note' && (
                      <button
                        onClick={() => setEditing((v) => !v)}
                        className="text-ink flex items-center gap-1 text-xs font-bold transition-opacity active:opacity-60"
                      >
                        <Pencil size={13} strokeWidth={2.6} /> {editing ? 'Done' : 'Edit'}
                      </button>
                    )}
                    <button
                      onClick={() => download(t.id)}
                      disabled={busy === t.id}
                      className="text-ink flex items-center gap-1 text-xs font-bold transition-opacity active:opacity-60 disabled:opacity-40"
                    >
                      <Share2 size={13} strokeWidth={2.6} /> {busy === t.id ? 'Opening…' : 'Share'}
                    </button>
                  </div>
                </div>
                {t.id === 'bubble-note' && editing && (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Add a description…"
                    autoFocus
                    className="mb-2 w-full rounded-xl bg-sys-fill px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-mint"
                  />
                )}
                <div className="flex justify-center overflow-x-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)] py-3">
                  <div
                    ref={(el) => { refs.current[t.id] = el; }}
                    style={{ display: 'inline-block', background: transparent ? 'transparent' : cardBg, borderRadius: 24, padding: 8 }}
                  >
                    {t.render(ctx)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-ink-3 mt-3 text-[11px] font-semibold">
            Tap Share → “Save Image” to add it to Photos, or share straight to a story.
          </p>
        </div>
      </div>
    </div>
  );
}
