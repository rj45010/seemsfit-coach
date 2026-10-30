import { useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

const MAX = 80;
const TRIGGER = 60;

/** Wrap a screen to enable pull-to-refresh (mobile, when scrolled to top). */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = window.scrollY <= 0 && !refreshing ? e.touches[0].clientY : null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const d = e.touches[0].clientY - startY.current;
    setPull(d > 0 ? Math.min(MAX, d * 0.5) : 0);
  }
  async function onTouchEnd() {
    if (startY.current == null) return;
    const go = pull >= TRIGGER;
    startY.current = null;
    if (!go) return setPull(0);
    setRefreshing(true);
    setPull(46);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden"
        style={{ height: pull, opacity: pull / TRIGGER, transition: startY.current == null ? 'height 0.2s, opacity 0.2s' : undefined }}
      >
        <RefreshCw size={20} strokeWidth={2.5} className={refreshing ? 'animate-spin' : ''} style={{ transform: `rotate(${pull * 3}deg)` }} />
      </div>
      {/* Only transform while actually pulling — a resting transform creates a
          containing block that would trap fixed-position modals (info sheets). */}
      <div style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: startY.current == null ? 'transform 0.2s' : undefined }}>
        {children}
      </div>
    </div>
  );
}
