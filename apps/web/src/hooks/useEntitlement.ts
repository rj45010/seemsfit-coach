/**
 * Subscription entitlement — the single source of truth for paid features (e.g. AI food
 * logging). Hard-coded to Pro during testing. When we wire real billing later (StoreKit /
 * RevenueCat / a Firebase custom claim), ONLY this hook changes — every gate already reads
 * `isPro`, so going live is a one-line swap with no feature rework.
 */
export interface Entitlement {
  isPro: boolean;
}

export function useEntitlement(): Entitlement {
  // TODO: read real subscription status here (server claim / store). Pro for all, for now.
  return { isPro: true };
}
