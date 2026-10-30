import { Sparkles, RefreshCw, Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { tapLight } from '@/lib/haptics';
import type { Insight } from '@/lib/types';

/**
 * Daily summary card. The headline is always visible; tapping the card opens the full briefing as an
 * immersive moment (no inline expand/collapse). Refresh stays inline.
 */
export function InsightCard({
  insight,
  onRefresh,
  refreshing,
  onImmerse,
}: {
  insight: Insight;
  onRefresh?: () => void;
  refreshing?: boolean;
  onImmerse?: () => void;
}) {
  return (
    <Card
      accent="butter"
      className="mb-4 cursor-pointer"
      onClick={onImmerse ? () => { tapLight(); onImmerse(); } : undefined}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={2.5} />
          <span className="eyebrow">Daily summary</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRefresh && (
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              disabled={refreshing}
              aria-label="Refresh summary"
              className="text-ink-3 hover:text-ink"
            >
              <RefreshCw size={15} strokeWidth={2.5} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          {onImmerse && <Maximize2 size={15} strokeWidth={2.5} className="text-ink-3" />}
        </div>
      </div>

      <h2 className="display line-clamp-2 text-xl leading-tight">{insight.headline}</h2>
    </Card>
  );
}
