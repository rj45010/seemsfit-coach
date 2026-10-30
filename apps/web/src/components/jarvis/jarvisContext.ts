import { createContext, useContext } from 'react';

export interface JarvisCtxValue {
  isOpen: boolean;
  seed?: string;
  autoSend?: boolean; // send the seed immediately (for voice/quick-log shortcuts)
  openJarvis: (seed?: string, opts?: { send?: boolean }) => void;
  closeJarvis: () => void;
}

export const JarvisCtx = createContext<JarvisCtxValue | null>(null);

export function useJarvis(): JarvisCtxValue {
  const ctx = useContext(JarvisCtx);
  if (!ctx) throw new Error('useJarvis must be used within <JarvisProvider>');
  return ctx;
}
