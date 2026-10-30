import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sparkline } from '@/components/ui/Sparkline';
import { useMetricsRange } from '@/hooks/useMetrics';
import { METRICS } from '@/lib/metricConfig';
import { num } from '@/lib/format';

/**
 * Trends is a scannable index of every metric — latest value + a 30-day
 * sparkline — that opens the rich per-metric detail page (`/trends/:metric`).
 */
export default function Trends() {
  const { data, isLoading } = useMetricsRange(30);

  // Oldest → newest, so sparklines read left (past) to right (now).
  const days = useMemo(() => [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="Over time" title="Trends" />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {METRICS.map((m) => (
            <Skeleton key={m.key} className="h-17" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {METRICS.map((m) => {
            const series = days.map((d) => m.get(d)).filter((v): v is number => v != null);
            const latest = series.length ? series[series.length - 1] : null;
            return (
              <Link key={m.key} to={`/trends/${m.key}`}>
                <Card accent="surface" className="flex items-center gap-3 transition-opacity active:opacity-70">
                  <div className="w-24 shrink-0">
                    <p className="eyebrow">{m.label}</p>
                    <p className="big-number text-lg leading-tight">
                      {latest != null ? num(latest, m.digits) : '—'}
                      {m.unit && latest != null && <span className="text-ink-2 ml-0.5 text-[11px] font-bold">{m.unit}</span>}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Sparkline values={series} color={m.stroke} />
                  </div>
                  <ChevronRight size={18} strokeWidth={2.5} className="text-ink-3 shrink-0" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
