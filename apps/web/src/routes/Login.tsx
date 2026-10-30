import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, Dumbbell, HeartPulse, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signInWithGoogle, NotAuthorizedError } from '@/lib/firebase';

type Slide = { icon: typeof Activity; accent: string; title: string; body: string };

// Showcase carousel = lightweight onboarding. Each slide is a styled preview of
// a core feature (no extra navigation — value is shown right on the login page).
const SLIDES: Slide[] = [
  {
    icon: Activity,
    accent: 'var(--color-mint)',
    title: 'Recovery, strain & sleep',
    body: 'Daily rings that read your body and tell you how hard to go.',
  },
  {
    icon: Dumbbell,
    accent: 'var(--color-butter)',
    title: 'Log every workout',
    body: 'Sets, reps and load — or record live from your Apple Watch.',
  },
  {
    icon: HeartPulse,
    accent: 'var(--color-pink)',
    title: 'All your health, one place',
    body: 'Apple Health, steps, sleep and lab reports synced automatically.',
  },
  {
    icon: Sparkles,
    accent: 'var(--color-lavender)',
    title: 'Your AI coach',
    body: 'Ask Vyom to plan, adjust and explain — built around your data.',
  },
];

export default function Login() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);

  // Auto-advance; pauses naturally while the user is mid-swipe.
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % SLIDES.length), 3800);
    return () => clearInterval(t);
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) {
      setI((p) => (p + (dx < 0 ? 1 : -1) + SLIDES.length) % SLIDES.length);
    }
    touchX.current = null;
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof NotAuthorizedError) {
        navigate('/rejected', { replace: true });
        return;
      }
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      console.error('[signin]', code, e);
      setError(code || (e instanceof Error ? e.message : 'Sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  const Slide = SLIDES[i];

  return (
    <div
      className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden"
      style={{
        background: `linear-gradient(165deg, color-mix(in srgb, ${Slide.accent} 58%, var(--color-surface)) 0%, var(--color-surface) 52%)`,
        transition: 'background 500ms ease',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 pt-12">
        <img
          src="/icons/app-logo.png"
          alt=""
          className="h-10 w-10 rounded-2xl object-cover"
          style={{ boxShadow: 'var(--shadow-2)' }}
        />
        <span className="display text-xl">SeemsFit</span>
      </div>

      {/* Hero glyph */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div
          className="flex h-28 w-28 items-center justify-center rounded-[32px]"
          style={{ background: Slide.accent, boxShadow: 'var(--shadow-2)', transition: 'background 500ms ease' }}
        >
          <Slide.icon size={54} strokeWidth={2.1} color="var(--color-ink)" />
        </div>
      </div>

      {/* Copy + dots + sign-in, anchored to the lower third */}
      <div className="safe-bottom px-6 pb-8">
        <h1 className="display text-[34px] leading-[1.05]">{Slide.title}</h1>
        <p className="text-ink-2 mt-3 max-w-[19rem] text-base font-medium leading-relaxed">{Slide.body}</p>

        {/* Dots */}
        <div className="mt-6 flex gap-2">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              aria-label={`Slide ${n + 1}`}
              onClick={() => setI(n)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: n === i ? 26 : 7,
                background: n === i ? 'var(--color-ink)' : 'color-mix(in srgb, var(--color-ink) 22%, transparent)',
              }}
            />
          ))}
        </div>

        <div className="mt-8">
          <Button variant="ink" onClick={handleSignIn} disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Continue with Google'}
          </Button>
          {error && <p className="text-crit mt-3 text-center text-xs font-bold wrap-break-word">{error}</p>}
          <p className="text-ink-3 mt-4 text-center text-[11px] font-semibold leading-relaxed">
            By continuing you agree to our{' '}
            <Link to="/terms" className="underline">Terms</Link> and{' '}
            <Link to="/terms?tab=privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
