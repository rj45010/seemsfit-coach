export type TimeVariant = 'morning' | 'afternoon' | 'evening';

/** Kept for callers that still ask (greeting etc.). Not used to vary the ambient colour anymore. */
export function timeVariant(d = new Date()): TimeVariant {
  const hm = d.getHours() + d.getMinutes() / 60;
  if (hm < 12) return 'morning';
  if (hm < 16.5) return 'afternoon';
  return 'evening';
}

export interface AmbientMotion {
  speed?: number;
  dir?: 'omni' | 'up' | 'diagonal';
  particle?: number;
  breathe?: number;
}

/**
 * The ambient backdrop palette. The app uses ONE calm scheme everywhere — a soft accent-green glow
 * over the charcoal base (that "dark at the bottom, light at the top" feel), no per-page or
 * per-workout colours. `glowAnchor` still lets a page place the glow (top/bottom/centre).
 */
export interface AmbientTheme {
  mesh: [string, string, string];
  glow: string;
  particle: string;
  glowAnchor?: 'top' | 'bottom' | 'center';
  motion?: AmbientMotion;
}

// One calm scheme on the cream base — a barely-there warm wash + a few soft specks, so the page
// reads clean like the reference layouts. (Stronger dynamic motion can come later.)
const BASE: AmbientTheme = {
  glowAnchor: 'top',
  glow: 'rgba(219, 155, 130, 0.10)',
  particle: 'rgba(160, 140, 120, 0.5)',
  mesh: ['rgba(233, 196, 106, 0.08)', 'rgba(219, 155, 130, 0.08)', 'rgba(169, 185, 140, 0.07)'],
  motion: { dir: 'omni', speed: 1.2 },
};

/** One scheme for the whole app — route/time no longer change the ambient colour. */
export function ambientThemeForRoute(_pathname: string, _t: TimeVariant): AmbientTheme {
  return BASE;
}
