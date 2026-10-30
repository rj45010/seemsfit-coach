/** React Query key factory for plans/programs (shapes kept identical to legacy). */
export const planKeys = {
  plans: (uid: string | undefined) => ['plans', uid] as const,
  plan: (uid: string | undefined, id: string | undefined) => ['plan', uid, id] as const,
  programs: (uid: string | undefined) => ['programs', uid] as const,
};
