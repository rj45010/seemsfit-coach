import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Per-history-entry scroll positions. Keyed by router location.key so each
// back/forward entry remembers exactly where the user was.
const positions = new Map<string, number>();

/**
 * Manual scroll restoration for BrowserRouter:
 * - PUSH/REPLACE (opening a new screen) → jump to top.
 * - POP (back/forward) → restore the saved scroll position.
 * Combined with `navigate(-1)` back buttons, this returns you to the exact
 * spot in a long list (e.g. Train history) after viewing a detail page.
 */
export function ScrollRestoration() {
  const { key } = useLocation();
  const navType = useNavigationType();

  // Track scroll for the current entry; flush on unmount/key change too.
  useEffect(() => {
    const onScroll = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      positions.set(key, window.scrollY);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);

  useEffect(() => {
    if (navType === 'POP') {
      const target = positions.get(key) ?? 0;
      // Retry across a few frames so cached list content can lay out first.
      let tries = 0;
      const restore = () => {
        window.scrollTo(0, target);
        if (Math.abs(window.scrollY - target) > 2 && tries < 12) {
          tries += 1;
          requestAnimationFrame(restore);
        }
      };
      requestAnimationFrame(restore);
    } else {
      window.scrollTo(0, 0);
    }
  }, [key, navType]);

  return null;
}
