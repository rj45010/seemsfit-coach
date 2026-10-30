import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { JarvisCtx } from './jarvisContext';

/**
 * App-wide access to the Jarvis assistant. Jarvis is a full-screen overlay
 * (not a route), so opening it never changes the active tab — closing returns
 * the user to exactly where they were.
 */
export function JarvisProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();
  const [autoSend, setAutoSend] = useState(false);

  const openJarvis = useCallback((s?: string, opts?: { send?: boolean }) => {
    setSeed(s);
    setAutoSend(!!opts?.send);
    setIsOpen(true);
  }, []);
  const closeJarvis = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, seed, autoSend, openJarvis, closeJarvis }),
    [isOpen, seed, autoSend, openJarvis, closeJarvis],
  );

  return <JarvisCtx.Provider value={value}>{children}</JarvisCtx.Provider>;
}
