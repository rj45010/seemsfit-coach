import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { TermsContent, PrivacyContent, APP_NAME } from '@/content/legal';
import { useTermsStatus, useAcceptTerms } from '@/hooks/useTerms';

/**
 * Hard gate after login: the app is unreachable until the signed-in user has
 * accepted the current Terms & Privacy version. Shown once per version.
 */
export default function TermsGate() {
  const { data, isLoading } = useTermsStatus();
  const accept = useAcceptTerms();
  const [tab, setTab] = useState<'terms' | 'privacy'>('terms');

  // Avoid a flash of the consent wall on a fast/cached open. `data === undefined`
  // covers the window where auth is still resolving and this query is disabled
  // (a disabled React Query reports isLoading === false, so isLoading alone let the
  // wall paint for a few frames on launch).
  if (isLoading || data === undefined) return <div className="bg-paper fixed inset-0" />;
  if (data.accepted) return <Outlet />;

  return (
    <div className="bg-paper fixed inset-0 z-50 flex flex-col">
      <div
        className="mx-auto flex h-full w-full max-w-2xl flex-col px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <h1 className="display text-[26px] leading-tight">Before you start</h1>
        <p className="text-ink-2 mt-1 mb-3 text-sm font-medium">
          Please review and accept the {APP_NAME} Terms of Service and Privacy Policy to continue.
        </p>

        <div className="mb-2 flex items-center gap-2">
          <Pill tone="ink" active={tab === 'terms'} onClick={() => setTab('terms')}>Terms</Pill>
          <Pill tone="ink" active={tab === 'privacy'} onClick={() => setTab('privacy')}>Privacy</Pill>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)] px-4 py-3">
          {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>

        <div className="safe-bottom py-4">
          <Button
            variant="ink"
            className="w-full"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? 'Saving…' : 'I agree — continue'}
          </Button>
          <p className="text-ink-3 mt-2 text-center text-[11px] font-semibold">
            By tapping “I agree” you accept the Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
