import { useState } from 'react';
import { NumberPicker, nearest, type PickerValue } from './NumberPicker';
import { tapLight } from '@/lib/haptics';

/** A tonal field that opens the scroll-wheel picker instead of a keyboard. */
export function NumberField({
  value,
  onChange,
  options,
  title,
  unit,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: PickerValue[];
  title: string;
  unit?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-2xl bg-sys-fill px-4 py-3 text-left text-sm font-semibold transition-opacity active:opacity-70 ${className}`}
      >
        {value !== '' ? (
          <>
            {value}
            {unit ? <span className="text-ink-3 font-medium"> {unit}</span> : null}
          </>
        ) : (
          <span className="text-ink-3 font-medium">{placeholder ?? 'Tap to set'}</span>
        )}
      </button>
      {open && (
        <NumberPicker
          title={title}
          saveLabel="Set"
          columns={[
            {
              label: unit ?? '',
              options,
              initialValue: nearest(options, value === '' ? undefined : Number(value)),
            },
          ]}
          onClose={() => setOpen(false)}
          onSave={([v]) => {
            tapLight();
            onChange(String(v));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
