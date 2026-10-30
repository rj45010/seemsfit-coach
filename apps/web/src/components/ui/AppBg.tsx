import type { ReactNode } from 'react';

/**
 * Page wrapper. Renders the fixed "Liquid Glass" refracting background layer
 * (.app-bg-layer in globals.css) behind the router outlet, so glass surfaces
 * have a soft accent-tinted backdrop to blur. Also guarantees full height.
 */
export function AppBg({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full w-full">
      <div className="app-bg-layer" aria-hidden />
      {children}
    </div>
  );
}
