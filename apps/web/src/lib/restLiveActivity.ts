import { Capacitor, registerPlugin } from '@capacitor/core';

interface RestTimerBridgePlugin {
  startRest(opts: { endsAt: number }): Promise<void>; // endsAt = epoch ms
  updateRest(opts: { endsAt: number }): Promise<void>;
  endRest(): Promise<void>;
  getRest(): Promise<{ endsAt: number }>; // 0 when no activity is running
}

const RestTimerBridge = registerPlugin<RestTimerBridgePlugin>('RestTimerBridge');

const onIOS = () => Capacitor.getPlatform() === 'ios';

/** Start the rest-timer Live Activity (Dynamic Island + Lock Screen). No-op off iOS. */
export async function startRestActivity(endsAt: number): Promise<void> {
  if (!onIOS()) return;
  try { await RestTimerBridge.startRest({ endsAt }); } catch { /* not supported / denied */ }
}

/** Update the running Live Activity's end time (when the user ±adjusts rest). */
export async function updateRestActivity(endsAt: number): Promise<void> {
  if (!onIOS()) return;
  try { await RestTimerBridge.updateRest({ endsAt }); } catch { /* ignore */ }
}

/** Dismiss the rest-timer Live Activity. */
export async function endRestActivity(): Promise<void> {
  if (!onIOS()) return;
  try { await RestTimerBridge.endRest(); } catch { /* ignore */ }
}

/**
 * The running Live Activity's end time (epoch ms), or null if none / off iOS.
 * Used to pick up ±15s adjustments the user made from the Lock Screen.
 */
export async function getRestActivityEndsAt(): Promise<number | null> {
  if (!onIOS()) return null;
  try {
    const { endsAt } = await RestTimerBridge.getRest();
    return endsAt > 0 ? endsAt : null;
  } catch { return null; }
}
