import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Real haptics on iOS/Android via the native Taptic engine (@capacitor/haptics); on the web it
// falls back to the Vibration API (a no-op on iOS Safari/WKWebView, which is why we need the plugin
// on device). All calls are fire-and-forget and never throw.
const native = Capacitor.isNativePlatform();

function webVibe(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* ignore */
  }
}

/** Light tap — buttons, steppers, toggles. */
export const tapLight = () => {
  if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else webVibe(8);
};
/** Medium tap — primary actions (log, save). */
export const tapMedium = () => {
  if (native) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  else webVibe(16);
};
/** Success — completion / saved / goal hit (a distinct double-tap notification). */
export const tapSuccess = () => {
  if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else webVibe([12, 50, 24]);
};
