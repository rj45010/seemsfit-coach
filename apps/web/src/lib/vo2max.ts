import { registerPlugin, Capacitor } from '@capacitor/core';

/** Native VO2 max read (iOS). Capgo's health plugin doesn't expose vo2Max, so we read
 *  Apple's Cardio Fitness sample through a small native plugin (see App/VO2MaxBridge.swift). */
interface VO2MaxPlugin {
  latest(): Promise<{ value?: number; date?: string }>;
}

const VO2Max = registerPlugin<VO2MaxPlugin>('VO2Max');

/** Latest VO2 max (ml/kg·min), or undefined off iOS / when no sample exists. */
export async function readVO2Max(): Promise<number | undefined> {
  if (Capacitor.getPlatform() !== 'ios') return undefined;
  try {
    const r = await VO2Max.latest();
    return typeof r.value === 'number' && r.value > 0 ? r.value : undefined;
  } catch {
    return undefined;
  }
}
