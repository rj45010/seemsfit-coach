import { useEffect, useRef } from 'react';

/**
 * Horizontal drag-scroll with our own axis lock. The browser's native
 * scroll-direction detection sends a slightly-diagonal swipe to the page
 * (vertical), which makes short pill rows feel like they "don't scroll".
 *
 * Here we watch the first few px of finger movement and lock to the dominant
 * axis: mostly-horizontal → scroll this row and preventDefault (so the page
 * stays put); mostly-vertical → do nothing and let the page scroll normally.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let axis: 'h' | 'v' | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startLeft = el.scrollLeft;
      axis = null;
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (axis === 'h') {
        el.scrollLeft = startLeft - dx;
        e.preventDefault(); // keep the page from scrolling vertically
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
    };
  }, []);

  return ref;
}
