import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth, onAuthStateChanged, signOut, isAllowedEmail } from '@/lib/firebase';

export type AuthStatus = 'unknown' | 'authed' | 'unauthed' | 'rejected';

export interface AuthState {
  user: User | null;
  loading: boolean;
  status: AuthStatus;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('unknown');

  useEffect(() => {
    // Safety net: if the auth observer somehow never fires (WKWebView quirk),
    // don't hang on the splash forever — fall through to the login screen.
    const timer = setTimeout(() => {
      setStatus((s) => (s === 'unknown' ? 'unauthed' : s));
    }, 5000);
    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(timer);
      if (!u) {
        setUser(null);
        setStatus('unauthed');
        return;
      }
      // Guard: a token for a non-allowlisted email must never resolve to authed.
      if (!isAllowedEmail(u.email) || !u.emailVerified) {
        setUser(null);
        setStatus('rejected');
        void signOut(auth);
        return;
      }
      setUser(u);
      setStatus('authed');
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  return { user, loading: status === 'unknown', status };
}
