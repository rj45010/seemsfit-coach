import { Ring } from './Ring';
import type { Recovery, RecoveryBand } from '@/lib/readiness';

const BAND_COLOR: Record<RecoveryBand, string> = {
  primed: '#34d399',
  steady: '#3b87c9',
  easy: '#f5b301',
  recover: '#fb7185',
};

export function RecoveryRing({ recovery }: { recovery: Recovery }) {
  return (
    <div className="flex items-center gap-5">
      <Ring value={recovery.score / 100} size={132} stroke={15} color={BAND_COLOR[recovery.band]}>
        <span className="big-number text-4xl">{recovery.score}</span>
        <span className="eyebrow mt-0.5 text-[9px]">recovery</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <p className="display text-xl leading-tight">{recovery.label}</p>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {recovery.drivers.map((d, i) => (
            <li key={i} className="text-ink-2 text-xs font-semibold">
              {d}
            </li>
          ))}
        </ul>
        {recovery.confidence === 'low' && (
          <p className="text-ink-3 mt-1.5 text-[11px] font-semibold">Limited data — read loosely</p>
        )}
      </div>
    </div>
  );
}
