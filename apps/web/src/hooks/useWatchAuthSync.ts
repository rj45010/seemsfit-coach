import { useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { pushWatchAuth } from '@/lib/watchBridge';
import { useAuth } from './useAuth';

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
const JARVIS_URL = import.meta.env.VITE_JARVIS_URL as string;

/**
 * Vends a fresh Firebase ID token to the paired Apple Watch so it can talk to Jarvis and
 * write meals on its own (phone in pocket). Pushes on mount and every ~45 min (tokens last
 * ~1h). No-op off iOS.
 */
export function useWatchAuthSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !PROJECT_ID || !JARVIS_URL) return;
    let cancelled = false;
    const push = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token && !cancelled) {
          await pushWatchAuth({ token, uid: user.uid, projectId: PROJECT_ID, jarvisUrl: JARVIS_URL });
        }
      } catch {
        /* not reachable — harmless */
      }
    };
    void push();
    const id = setInterval(push, 45 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);
}
