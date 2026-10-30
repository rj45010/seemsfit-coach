import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// Single unified theme — warm cream (toggle removed). The API below is a thin shim so callers
// (BottomNav, the native-chat bridge) still compile; everything resolves to this one theme.
const PAPER = '#f1e9d8';
const current: Theme = 'light';

function apply() {
  document.documentElement.classList.remove('dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER);
}

export function getTheme(): Theme {
  return current;
}

/** No-op — the app has a single theme now. */
export function setTheme(_t?: Theme) {}
/** No-op — the app has a single theme now. */
export function toggleTheme() {}

/** No-op subscription — theme never changes, but the native-chat bridge still calls this. */
export function subscribeTheme(_cb: () => void): () => void {
  return () => {};
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    () => () => {},
    () => current,
    () => current,
  );
}

apply();
