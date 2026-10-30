/**
 * Local-only drafts of in-progress set logging, so values survive closing the
 * app (or navigating away) before you tap Log. Cleared once the session logs.
 */
const PREFIX = 'sf-draft:';

export const draftKey = (planId: string, exName: string) => `${PREFIX}${planId}::${exName}`;

export function readDraft<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled — drafts are best-effort */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Clear every exercise draft for a plan (after it's logged). */
export function clearPlanDrafts(planId: string): void {
  try {
    const p = `${PREFIX}${planId}::`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
