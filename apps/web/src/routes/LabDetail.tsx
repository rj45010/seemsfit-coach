import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { MarkerGrid } from '@/components/labs/MarkerGrid';
import { useLab } from '@/hooks/useLabs';
import { pdfUrl } from '@/lib/labUpload';
import { fmtDayKey } from '@/lib/date';

export default function LabDetail() {
  const { id } = useParams();
  const { data: lab, isLoading } = useLab(id);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (lab?.pdfStoragePath) pdfUrl(lab.pdfStoragePath).then(setUrl).catch(() => setUrl(null));
  }, [lab?.pdfStoragePath]);

  if (isLoading) {
    return (
      <>
        <BackHeader to="/labs" label="Labs" />
        <SkeletonList rows={3} />
      </>
    );
  }
  if (!lab) {
    return (
      <>
        <BackHeader to="/labs" label="Labs" />
        <EmptyState title="Report not found" />
      </>
    );
  }

  return (
    <>
      <BackHeader to="/labs" label="Labs" />

      <Card accent="butter" className="mb-4">
        <p className="eyebrow">Vyom · {fmtDayKey(lab.reportDate)}</p>
        <h1 className="display mb-1 text-xl">{lab.lab || 'Blood report'}</h1>
        {lab.status === 'pending' && <p className="text-sm font-bold">Parsing in progress…</p>}
        {lab.status === 'failed' && (
          <p className="text-crit text-sm font-bold">Parsing failed: {lab.parseError}</p>
        )}
        {lab.jarvisSummary && <p className="text-sm font-medium leading-relaxed">{lab.jarvisSummary}</p>}
      </Card>

      {lab.markers && lab.markers.length > 0 && <MarkerGrid markers={lab.markers} />}

      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-block">
          <Button variant="surface">Open PDF</Button>
        </a>
      )}
    </>
  );
}
