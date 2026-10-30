import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type PickerValue = number | string;

export interface PickerColumn {
  label: string;
  options: PickerValue[];
  initialValue?: PickerValue;
  flex?: number;
}

export interface QuickAction {
  label: string;
  colIndex: number;
  value: PickerValue;
}

const ITEM_HEIGHT = 44;

/** One scroll-snap wheel; reports the centered value on scroll. */
function ScrollWheel({
  options,
  value,
  onChange,
}: {
  options: PickerValue[];
  value: PickerValue;
  onChange: (v: PickerValue) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<PickerValue>(value);

  useEffect(() => {
    const i = options.findIndex((o) => String(o) === String(value));
    if (ref.current && i !== -1) {
      const target = i * ITEM_HEIGHT;
      if (Math.abs(ref.current.scrollTop - target) > ITEM_HEIGHT / 2) {
        ref.current.scrollTop = target;
        last.current = value;
      }
    }
  }, [options, value]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const i = Math.round(e.currentTarget.scrollTop / ITEM_HEIGHT);
    const next = options[i];
    if (next !== undefined && next !== last.current) {
      last.current = next;
      onChange(next);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(2);
    }
  }

  return (
    <div className="np-wheel" ref={ref} onScroll={onScroll}>
      <div className="np-spacer" />
      {options.map((o, i) => (
        <div key={i} className={`np-item ${String(o) === String(value) ? 'active' : ''}`}>
          {o}
        </div>
      ))}
      <div className="np-spacer" />
    </div>
  );
}

/** iOS-style scroll-wheel number picker as a neo-brutalism bottom sheet. */
export function NumberPicker({
  title,
  subtitle,
  saveLabel = 'Save',
  columns,
  quickActions = [],
  onClose,
  onSave,
}: {
  title: string;
  subtitle?: string;
  saveLabel?: string;
  columns: PickerColumn[];
  quickActions?: QuickAction[];
  onClose: () => void;
  onSave: (values: PickerValue[]) => void;
}) {
  const [sel, setSel] = useState<PickerValue[]>(() =>
    columns.map((c) => (c.initialValue !== undefined ? c.initialValue : c.options[0])),
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const change = (i: number, v: PickerValue) =>
    setSel((p) => p.map((x, idx) => (idx === i ? v : x)));

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-overlay safe-bottom w-full max-w-md rounded-t-[28px] px-5 pt-3"
        style={{ boxShadow: 'var(--shadow-3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50" />
        <h2 className="display text-2xl">{title}</h2>
        {subtitle && <p className="text-ink-3 mb-1 text-sm font-semibold">{subtitle}</p>}

        {/* column labels */}
        <div className="text-ink-2 mt-3 flex text-[11px] font-bold uppercase tracking-wide">
          {columns.map((c, i) => (
            <div key={i} className="text-center" style={{ flex: c.flex ?? 1 }}>
              {c.label}
            </div>
          ))}
        </div>

        {/* wheels */}
        <div className="np-mask relative flex" style={{ height: 220 }}>
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -mt-[22px] h-[44px] rounded-2xl"
            style={{ background: 'color-mix(in srgb, var(--color-ink) 6%, transparent)' }}
          />
          {columns.map((c, i) => (
            <div key={i} className="z-[1] flex items-center overflow-hidden" style={{ flex: c.flex ?? 1 }}>
              <ScrollWheel options={c.options} value={sel[i]} onChange={(v) => change(i, v)} />
            </div>
          ))}
        </div>

        {quickActions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {quickActions.map((q, i) => (
              <button
                key={i}
                onClick={() => change(q.colIndex, q.value)}
                className="nb-btn text-ink flex-1 px-3 py-2.5 text-xs font-semibold"
                style={{ background: 'color-mix(in srgb, var(--color-ink) 6%, transparent)' }}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {/* footer */}
        <div className="mt-4 mb-2 flex items-center gap-3">
          <button onClick={() => onSave(sel)} className="nb-btn bg-ink text-paper flex-1 py-3.5 text-sm font-semibold">
            {saveLabel}
          </button>
          <button
            onClick={onClose}
            aria-label="Cancel"
            className="nb-btn text-ink flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--color-ink) 6%, transparent)' }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Helper: numeric option range [min..max] step. */
export function range(min: number, max: number, step = 1): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Snap a value to the nearest option (so an odd stored value still centers). */
export function nearest(options: PickerValue[], value: PickerValue | undefined): PickerValue {
  if (value == null || value === '') return options[0];
  const nums = options.filter((o) => typeof o === 'number') as number[];
  if (typeof value === 'number' && nums.length) {
    return nums.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), nums[0]);
  }
  return options.find((o) => String(o) === String(value)) ?? options[0];
}
