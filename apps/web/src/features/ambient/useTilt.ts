import { useEffect, useRef } from 'react';

/**
 * Device-tilt parallax — the liquid-glass "alive" signature. Returns a ref holding smoothed tilt in
 * ~[-1, 1] on each axis (x = left/right gamma, y = front/back beta) for the ambient layers to lean
 * with, and publishes `--glass-angle` on <html> so the glass specular rim sweeps as you tilt.
 *
 * iOS ≥13 requires DeviceOrientationEvent.requestPermission() from a user gesture, so we ask on the
 * first tap. No-ops under reduced-motion or where the API is unavailable (falls back to touch only).
 */
export function useTilt() {
  const tilt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let started = false;

    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0; // left/right [-90,90]
      const beta = e.beta ?? 0; // front/back [-180,180]
      tx = Math.max(-1, Math.min(1, gamma / 34));
      ty = Math.max(-1, Math.min(1, (beta - 45) / 34)); // centre on a ~45° hold angle
    };

    const loop = () => {
      tilt.current.x += (tx - tilt.current.x) * 0.08;
      tilt.current.y += (ty - tilt.current.y) * 0.08;
      document.documentElement.style.setProperty('--glass-angle', `${135 + tilt.current.x * 42}deg`);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (started) return;
      started = true;
      window.addEventListener('deviceorientation', onOrient);
      raf = requestAnimationFrame(loop);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqPerm = (window as any).DeviceOrientationEvent?.requestPermission as
      | (() => Promise<'granted' | 'denied'>)
      | undefined;

    const gesture = () => {
      window.removeEventListener('touchend', gesture);
      window.removeEventListener('click', gesture);
      if (typeof reqPerm === 'function') {
        reqPerm().then((s) => { if (s === 'granted') start(); }).catch(() => {});
      } else {
        start();
      }
    };

    if (typeof reqPerm === 'function') {
      // iOS: must request from a user gesture.
      window.addEventListener('touchend', gesture, { once: true });
      window.addEventListener('click', gesture, { once: true });
    } else {
      start(); // Android / desktop: no permission needed.
    }

    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('touchend', gesture);
      window.removeEventListener('click', gesture);
      document.documentElement.style.removeProperty('--glass-angle');
      cancelAnimationFrame(raf);
    };
  }, []);

  return tilt;
}
