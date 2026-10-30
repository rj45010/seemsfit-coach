import { useEffect } from 'react';
import { NavLink, Outlet, useSearchParams, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sunrise, Dumbbell, HeartPulse, UtensilsCrossed, Target, LogOut, type LucideIcon } from 'lucide-react';
import { auth, signOut } from '@/lib/firebase';
import { JarvisProvider } from '@/components/jarvis/JarvisProvider';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { BottomNav } from '@/components/shell/BottomNav';
import { RestTimerBar } from '@/components/today/RestTimerBar';
import { FinOverlay } from '@/components/ui/FinOverlay';
import { BurstOverlay } from '@/components/ui/BurstOverlay';
import { useCelebration, clearCelebration } from '@/lib/celebrate';
import { useHealthKitSync } from '@/hooks/useHealthKit';
import { useReconcileStrengthWorkouts } from '@/features/workouts';
import { AmbientBackground, ambientThemeForRoute, timeVariant } from '@/features/ambient';
import Chat from '@/routes/Chat';

/** App-wide celebration blast (goal completed, etc.) — fires from any screen. */
function CelebrationOverlay() {
  const c = useCelebration();
  return <AnimatePresence>{c && <FinOverlay big={c.big} sub={c.sub} onDone={clearCelebration} />}</AnimatePresence>;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Desktop side-rail destinations.
const RAIL_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Sunrise, end: true },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/goals', label: 'Goals', icon: Target },
];

function railClass({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-100',
    isActive
      ? 'bg-lavender text-ink'
      : 'text-ink-2 hover:text-ink',
  ].join(' ');
}

/** Full-screen Jarvis takeover; ✕ returns to the screen underneath. */
function JarvisOverlay() {
  const { isOpen, seed, autoSend, closeJarvis } = useJarvis();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeJarvis();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeJarvis]);

  // Lock the page behind the overlay so it can't peek through or scroll (iOS).
  useEffect(() => {
    if (!isOpen) return;
    const y = window.scrollY;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${y}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    return () => {
      style.position = '';
      style.top = '';
      style.left = '';
      style.right = '';
      style.width = '';
      window.scrollTo(0, y);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="bg-paper page-x safe-top safe-bottom fixed inset-0 z-50 flex flex-col pt-2 pb-3 md:pt-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            <Chat seed={seed} autoSend={autoSend} onClose={closeJarvis} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Desktop rail Jarvis button — opens chat directly. */
function JarvisRailButton() {
  const { openJarvis } = useJarvis();
  return (
    <button
      onClick={() => openJarvis()}
      className="bg-butter text-ink flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity duration-100 active:opacity-70"
    >
      <img src="/icons/logo.png" alt="" className="h-5 w-5 rounded-md object-cover" />
      Vyom
    </button>
  );
}


function ShellLayout() {
  const { openJarvis } = useJarvis();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();

  // Live Apple HealthKit sync (iOS only) → today's metrics stay current.
  useHealthKitSync();

  // Auto-merge a strength session logged on BOTH watch + phone (phone weights + watch metrics),
  // app-wide so it fires regardless of which tab is open.
  useReconcileStrengthWorkouts();

  // Deep link: /?jarvis=1 opens Jarvis on launch; /?ask=<text> opens it seeded.
  // Lets an iOS Shortcut (Action button) jump straight into Jarvis.
  useEffect(() => {
    if (params.has('jarvis') || params.has('ask')) {
      openJarvis(params.get('ask') || undefined, { send: params.has('send') });
      const next = new URLSearchParams(params);
      next.delete('jarvis');
      next.delete('ask');
      next.delete('send');
      setParams(next, { replace: true });
    }
  }, [params, openJarvis, setParams]);

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Alive aurora backdrop — one engine for the whole app, themed by the current page (and by
          time of day on Today). Sits behind everything (z-index:-1); glass cards refract it. */}
      <AmbientBackground theme={ambientThemeForRoute(pathname, timeVariant())} />
      {/* Status-bar scrim (mobile): a blurred strip over the safe-area top so the OS clock/battery
          stay legible over the aurora. Masked to fade out at its lower edge (no hard band) so it
          blends into whatever gradient is behind it — consistent on every page. z-40 (below nav). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-40 md:hidden"
        style={{
          height: 'calc(env(safe-area-inset-top) + 10px)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          background: 'linear-gradient(to bottom, color-mix(in srgb, var(--color-paper) 68%, transparent), transparent)',
          maskImage: 'linear-gradient(to bottom, #000 52%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 52%, transparent)',
        }}
      />
      {/* Side rail (desktop) */}
      <aside className="safe-top hidden w-60 shrink-0 flex-col gap-1.5 p-4 md:flex md:sticky md:top-0 md:h-dvh">
        <div className="mb-5 px-1">
          <img src="/icons/logo_img.png" alt="seemsfit" className="h-7 w-auto object-contain object-left mix-blend-multiply dark:mix-blend-normal dark:invert" />
        </div>
        <nav className="flex flex-1 flex-col gap-1.5">
          {RAIL_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={railClass}>
              <Icon size={18} strokeWidth={2.5} />
              {label}
            </NavLink>
          ))}
        </nav>
        {/* Jarvis — pinned at the bottom, set apart from the nav */}
        <JarvisRailButton />
        <button
          onClick={() => signOut(auth)}
          className="text-ink-3 hover:text-ink flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition-colors"
        >
          <LogOut size={18} strokeWidth={2.5} />
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="page-x flex-1 pb-32 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:safe-top md:pt-5 md:pb-10">
        <div className="mx-auto w-full max-w-2xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation (mobile): Bevel-style bar → corner pills + 3×3 menu */}
      <BottomNav />

      <RestTimerBar />
      <CelebrationOverlay />
      <BurstOverlay />
      <JarvisOverlay />
    </div>
  );
}

export function AppShell() {
  return (
    <JarvisProvider>
      <ShellLayout />
    </JarvisProvider>
  );
}
