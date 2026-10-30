import type { ReactNode } from 'react';
import { useDragScroll } from '@/lib/useDragScroll';

/**
 * A horizontal scroller that reliably handles diagonal swipes (see useDragScroll).
 * Use for any pill/chip row instead of a bare `overflow-x-auto` div.
 */
export function HScroll({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useDragScroll<HTMLDivElement>();
  return (
    <div ref={ref} className={`hscroll ${className}`}>
      {children}
    </div>
  );
}
