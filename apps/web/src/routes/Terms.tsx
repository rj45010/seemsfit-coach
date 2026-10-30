import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Pill } from '@/components/ui/Pill';
import { TermsContent, PrivacyContent, APP_NAME } from '@/content/legal';

/**
 * Public, read-only legal page (no auth required). Reachable from the login
 * footer and Profile. ?tab=privacy opens the Privacy Policy directly.
 */
export default function Terms() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'terms' | 'privacy'>(params.get('tab') === 'privacy' ? 'privacy' : 'terms');

  return (
    <div
      className="mx-auto min-h-dvh max-w-2xl px-5 pb-16"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}
    >
      <button
        onClick={() => navigate(-1)}
        className="text-ink-2 mb-4 flex items-center gap-1 text-sm font-bold transition-opacity active:opacity-60"
      >
        <ArrowLeft size={16} strokeWidth={2.6} /> Back
      </button>

      <h1 className="display text-[28px] leading-tight">{APP_NAME} legal</h1>
      <div className="mt-4 mb-2 flex items-center gap-2">
        <Pill tone="ink" active={tab === 'terms'} onClick={() => setTab('terms')}>Terms of Service</Pill>
        <Pill tone="ink" active={tab === 'privacy'} onClick={() => setTab('privacy')}>Privacy Policy</Pill>
      </div>

      {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
    </div>
  );
}
