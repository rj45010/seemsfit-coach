import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sunrise, Dumbbell, HeartPulse, UtensilsCrossed, Target,
  TrendingUp, NotebookPen, Trophy, Menu, X, type LucideIcon,
} from 'lucide-react';
import { useJarvis } from '@/components/jarvis/jarvisContext';

interface NavDest { to?: string; label: string; icon?: LucideIcon; end?: boolean; jarvis?: boolean }

// Frosted "Liquid Glass" dock: chrome-tier glass tokens (translucent fill +
// heavy backdrop blur + light edge), so the page colour shows through softly.
const DOCK_BG = 'var(--glass-fill-chrome)';
const GLASS_BORDER = 'var(--glass-border)';
const GLASS_BLUR = 'blur(var(--glass-blur-chrome)) saturate(var(--glass-saturate))';
// Stronger drop shadow than the card glass shadow so the floating dock stays
// clearly separated from the page (especially on the light background).
const GLASS_SHADOW = '0 8px 16px -4px rgb(0 0 0 / 0.16), 0 16px 40px -8px rgb(0 0 0 / 0.28), inset 0 1px 0 0 var(--glass-highlight)';
const BRAND = 'var(--color-accent)'; // Vyom (AI) — the single brand accent (teal)
// Active destination: a solid surface pill with ink icon/label, so it reads as
// frosted glass made opaque and stays distinct from the charcoal AI button.
const NAV_ACCENT = 'var(--color-sys-bg-3)';
const NAV_ON_ACCENT = 'var(--color-ink)';

// Full-width bar (Bevel default): 4 destinations + Jarvis in the centre.
const BAR: NavDest[] = [
  { to: '/', label: 'Today', icon: Sunrise, end: true },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { jarvis: true, label: 'Vyom' },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/health', label: 'Health', icon: HeartPulse },
];

// 3×3 menu grid (Jarvis dead-centre).
const GRID: NavDest[] = [
  { to: '/', label: 'Today', icon: Sunrise, end: true },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { jarvis: true, label: 'Vyom' },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/records', label: 'Records', icon: Trophy },
];

function useActive() {
  const { pathname } = useLocation();
  return (d: NavDest) => (d.to ? (d.end ? pathname === '/' : pathname.startsWith(d.to)) : false);
}

/** Jarvis logo button (centre of the bar + grid). */
function JarvisLogo({ size = 54, onClick }: { size?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ask Vyom"
      className="relative flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{
        width: size,
        height: size,
        // Solid teal — the one primary action, so Vyom pops in the dock.
        background: BRAND,
        boxShadow: 'var(--shadow-3)',
        // Always sit above the sliding active pill, regardless of DOM order.
        zIndex: 2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: size - 16,
          height: size - 16,
          background: '#f4f7f5', // light logo on the teal
          WebkitMaskImage: 'url(/icons/jarvis.png)',
          maskImage: 'url(/icons/jarvis.png)',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
    </button>
  );
}

export function BottomNav() {
  const navigate = useNavigate();
  const { openJarvis } = useJarvis();
  const isActive = useActive();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Single persistent active-pill: we measure the active button and slide ONE
  // element (with its shadow) to it, instead of swapping a new pill per tab —
  // a fresh element would paint its shadow a frame late and look laggy.
  const barRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (collapsed) return;
    const measure = () => {
      const active = BAR.find((d) => isActive(d));
      const el = active ? btnRefs.current[active.label] : null;
      if (el) {
        // offsetLeft/offsetWidth are untransformed layout values — unlike
        // getBoundingClientRect they ignore the bar's entrance scale animation,
        // so the pill lands correctly even while the bar is still expanding.
        setPill({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };
    measure();
    // Re-measure once the expand animation settles (rect was scaled mid-flight).
    const t = window.setTimeout(measure, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, collapsed]);

  // Bevel behaviour: full bar at the top, splits into corner pills once scrolled.
  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (d: NavDest) => {
    setMenuOpen(false);
    if (d.jarvis) openJarvis();
    else if (d.to) navigate(d.to);
  };

  return (
    <>
      {/* ── 3×3 menu overlay ── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              aria-label="Close menu"
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              key="menu-sheet"
              className="glass-overlay safe-bottom fixed inset-x-0 bottom-0 z-[61] rounded-t-[28px] px-5 pt-3 pb-6 md:hidden"
              style={{ boxShadow: 'var(--shadow-3)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            >
              <div className="bg-ink-3 mx-auto mb-3 h-1 w-9 rounded-full opacity-50" />
              <div className="mb-3 flex items-center justify-between">
                <p className="display text-lg">Menu</p>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {GRID.map((d) => {
                  const active = isActive(d);
                  if (d.jarvis) {
                    return (
                      <div key="jarvis" className="flex flex-col items-center justify-center gap-1.5 py-2">
                        <JarvisLogo size={56} onClick={() => go(d)} />
                        <span className="text-ink text-xs font-semibold">AI</span>
                      </div>
                    );
                  }
                  const Icon = d.icon!;
                  return (
                    <button
                      key={d.label}
                      onClick={() => go(d)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 text-xs font-semibold transition-opacity active:opacity-70"
                      style={{
                        background: active ? NAV_ACCENT : 'color-mix(in srgb, var(--color-ink) 5%, transparent)',
                        color: active ? NAV_ON_ACCENT : 'var(--color-ink)',
                      }}
                    >
                      <Icon size={22} strokeWidth={2.5} />
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Dock ── */}
      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="relative mx-3 mb-3 h-[74px]">
          <AnimatePresence initial={false}>
            {!collapsed ? (
              /* Full-width bar */
              <motion.div
                ref={barRef}
                key="bar"
                className="pointer-events-auto absolute inset-0 flex items-center justify-between gap-1 rounded-full px-2"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              >
                {/* Glass underlay — blur lives here, NOT on an ancestor of the
                    sliding active pill, so framer-motion can measure & animate it. */}
                <div
                  className="absolute inset-0 -z-10 rounded-full"
                  style={{ background: DOCK_BG, boxShadow: GLASS_SHADOW, border: `1px solid ${GLASS_BORDER}`, backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR }}
                />
                {/* One persistent pill that slides between tabs — its shadow never
                    re-rasterizes, so the landing stays smooth (no late shadow). */}
                {pill && (
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      top: 7,
                      bottom: 7,
                      background: NAV_ACCENT,
                      // Light rim + inner highlight so the active tab reads clearly on the dark dock.
                      border: '1px solid rgb(255 255 255 / 0.16)',
                      boxShadow: '0 2px 8px rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.16)',
                    }}
                    initial={false}
                    animate={{ left: pill.left, width: pill.width }}
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  />
                )}
                {BAR.map((d) => {
                  if (d.jarvis) return <JarvisLogo key="jarvis" size={60} onClick={() => go(d)} />;
                  const Icon = d.icon!;
                  const active = isActive(d);
                  return (
                    <button
                      key={d.label}
                      ref={(el) => { btnRefs.current[d.label] = el; }}
                      onClick={() => go(d)}
                      aria-label={d.label}
                      className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 transition-opacity active:opacity-70"
                      style={{ color: active ? NAV_ON_ACCENT : 'var(--color-ink-2)' }}
                    >
                      <Icon size={20} strokeWidth={2.5} className="relative z-[1]" />
                      <span className="relative z-[1] text-[10px] font-semibold leading-none">{d.label}</span>
                    </button>
                  );
                })}
              </motion.div>
            ) : (
              /* Two corner pills (slide out from centre) */
              <motion.div
                key="pills"
                className="pointer-events-none absolute inset-0 flex items-center justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <motion.button
                  onClick={() => navigate('/')}
                  aria-label="Today"
                  className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: isActive(BAR[0]) ? NAV_ACCENT : DOCK_BG, color: isActive(BAR[0]) ? NAV_ON_ACCENT : 'var(--color-ink)', boxShadow: GLASS_SHADOW, border: `1px solid ${GLASS_BORDER}`, backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR }}
                  initial={{ x: 90, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 90, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                >
                  <Sunrise size={22} strokeWidth={2.5} />
                </motion.button>
                <motion.button
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open menu"
                  className="text-ink pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: DOCK_BG, boxShadow: GLASS_SHADOW, border: `1px solid ${GLASS_BORDER}`, backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR }}
                  initial={{ x: -90, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -90, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                >
                  {menuOpen ? <X size={22} strokeWidth={2.5} /> : <Menu size={22} strokeWidth={2.5} />}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
