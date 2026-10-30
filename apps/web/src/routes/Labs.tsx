import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { LabUploader } from '@/components/labs/LabUploader';
import { useLabs } from '@/hooks/useLabs';
import { useAuth } from '@/hooks/useAuth';
import { fmtDayKey } from '@/lib/date';
import type { Lab } from '@/lib/types';

function flagSummary(lab: Lab): string {
  const m = lab.markers ?? [];
  const high = m.filter((x) => x.flag === 'high' || x.flag === 'critical').length;
  const low = m.filter((x) => x.flag === 'low').length;
  if (lab.status === 'pending') return 'Parsing…';
  if (lab.status === 'failed') return 'Parse failed';
  const bits = [];
  if (high) bits.push(`${high} high`);
  if (low) bits.push(`${low} low`);
  return bits.length ? bits.join(' · ') : 'All normal';
}

export default function Labs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useLabs();

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="Bloodwork" title="Labs" />
      <LabUploader onUploaded={() => qc.invalidateQueries({ queryKey: ['labs', user?.uid] })} />

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No reports yet" hint="Drop a PDF above — Vyom extracts the markers." />
      ) : (
        <div className="flex flex-col gap-3">
          {data!.map((lab, i) => (
            <Link key={lab.id} to={`/labs/${lab.id}`}>
              <Card accent="sky" delay={Math.min(i * 0.04, 0.3)} className="transition-opacity active:opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{lab.lab || 'Blood report'}</p>
                    <p className="text-ink-2 text-xs font-semibold">{fmtDayKey(lab.reportDate)}</p>
                  </div>
                  <span className="text-ink-2 rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-2.5 py-0.5 text-xs font-semibold">
                    {flagSummary(lab)}
                  </span>
                </div>
                {lab.jarvisSummary && (
                  <p className="text-ink-2 mt-2 line-clamp-2 text-xs font-medium">{lab.jarvisSummary}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
