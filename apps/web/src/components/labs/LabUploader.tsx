import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadLabPdf } from '@/lib/labUpload';

export function LabUploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(file?: File) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setErr('PDF only');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await uploadLabPdf(file);
      onUploaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-ink-2 flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-[color-mix(in_srgb,var(--color-ink)_20%,transparent)] bg-surface py-7 text-sm font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
      >
        <Upload size={18} strokeWidth={2.5} />
        {busy ? 'Uploading…' : 'Upload a blood report PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {err && <p className="text-crit mt-2 text-xs font-bold">{err}</p>}
    </div>
  );
}
