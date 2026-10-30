import type { DailyMetrics } from './types';
import { combinedSleepMin } from './sleep';

function clamp(v: number) {
  return Math.max(0, Math.min(100, v));
}

export function readinessLabel(score: number): string {
  if (score >= 75) return 'Primed';
  if (score >= 55) return 'Steady';
  if (score >= 40) return 'Take it easy';
  return 'Recover';
}

/**
 * Estimated hours until you're recovered — our own transparent model (NOT
 * Firstbeat's proprietary EPOC algorithm). Two drivers: how far below "fresh"
 * recovery sits, plus how hard today's exertion was (a max-effort day adds the
 * most). Well recovered + easy day → ~0h. Heuristic, not medical.
 */
export interface RecoveryTime {
  hours: number; // total, capped 0–48
  fromRecovery: number; // hours contributed by being below "fresh"
  fromExertion: number; // hours contributed by today's effort
}

/** The two drivers behind the recovery-time estimate, for showing the breakdown. */
export function recoveryTimeParts(recoveryScore: number | undefined, exertion0to100: number | undefined): RecoveryTime {
  const score = recoveryScore ?? 60;
  const ex = exertion0to100 ?? 0;
  const fromRecovery = score >= 80 ? 0 : (80 - score) * 0.4; // up to ~32h at score 0
  const fromExertion = (ex / 100) * 12; // a max-effort day adds up to 12h
  return {
    hours: Math.round(Math.max(0, Math.min(48, fromRecovery + fromExertion))),
    fromRecovery: Math.round(fromRecovery),
    fromExertion: Math.round(fromExertion),
  };
}

export function recoveryTimeHours(recoveryScore: number | undefined, exertion0to100: number | undefined): number {
  return recoveryTimeParts(recoveryScore, exertion0to100).hours;
}

export type RecoveryBand = 'primed' | 'steady' | 'easy' | 'recover';

export interface Recovery {
  score: number;
  band: RecoveryBand;
  label: string;
  drivers: string[]; // short "why"
  confidence: 'high' | 'low'; // low = thin/missing core data (HRV/sleep) — read loosely
}

function band(score: number): RecoveryBand {
  if (score >= 75) return 'primed';
  if (score >= 55) return 'steady';
  if (score >= 40) return 'easy';
  return 'recover';
}

interface Signal {
  value: number; // 0-100 sub-score
  weight: number;
}

/**
 * Recovery score: a weighted blend of overnight signals, each judged vs the
 * person's own recent baseline. Uses whatever Apple data is present and renormalises
 * the weights over the available signals. HRV/RHR/resp/temp are scored by
 * Z-SCORE vs a recency-weighted baseline (HRV on a log scale); sleep/SpO2/water
 * are absolute. Heuristic, not medical.
 *   HRV 0.30 · resting HR 0.20 · sleep (duration + deep/REM quality) 0.25 ·
 *   respiratory rate 0.10 · wrist-temp 0.07 · SpO2 0.06 · hydration 0.05
 */
export interface RecoveryInputs {
  /** Today's self-report (1-5 each); strongly predictive. */
  journal?: { energy?: number; soreness?: number; mood?: number; stress?: number; ill?: boolean };
  /** Yesterday's training strain (Σ duration × RPE/effort). 0 / undefined = rest. */
  priorStrainAU?: number;
  /** Yesterday's fuel vs targets. */
  nutrition?: { calories?: number; protein?: number; calTarget?: number; proTarget?: number };
}

export function recovery(latest: DailyMetrics | null, recent: DailyMetrics[], inputs?: RecoveryInputs): Recovery | null {
  if (!latest) return null;
  const others = recent.filter((m) => m.id !== latest.id);

  // Recency-weighted baseline (mean + SD) for a metric, over `others` (sorted
  // newest-first). Recent days count more (exp decay, ~14-day half-ish life).
  const baseline = (pick: (m: DailyMetrics) => number | undefined) => {
    const xs: number[] = [];
    const ws: number[] = [];
    others.forEach((m, i) => {
      const v = pick(m);
      if (v != null) {
        xs.push(v);
        ws.push(Math.exp(-i / 14));
      }
    });
    const n = xs.length;
    if (!n) return { n: 0 } as { n: number; mean?: number; sd?: number };
    const W = ws.reduce((a, b) => a + b, 0);
    const mean = xs.reduce((s, x, i) => s + x * ws[i], 0) / W;
    const variance = xs.reduce((s, x, i) => s + ws[i] * (x - mean) ** 2, 0) / W;
    return { n, mean, sd: Math.sqrt(variance) };
  };

  // Sub-score from a z-score vs baseline (±SD). Falls back to a gentle %-deviation
  // when the baseline is too small/flat (new users). ~18 pts per SD.
  const zSub = (today: number, base: { n: number; mean?: number; sd?: number }, higherBetter: boolean, scale = 18) => {
    if (base.mean == null) return undefined;
    const dir = higherBetter ? 1 : -1;
    if (base.n < 3 || !base.sd || base.sd < 1e-6) {
      const pct = (today - base.mean) / (Math.abs(base.mean) || 1);
      return clamp(50 + dir * pct * 100);
    }
    return clamp(50 + dir * ((today - base.mean) / base.sd) * scale);
  };

  const signals: Signal[] = [];
  const drivers: string[] = [];

  // HRV — smoothed over the last up-to-3 readings (Apple's nightly sampling is
  // noisy), then z-scored on ln(HRV) (HRV is log-normal). Higher is better.
  const hrvSeries = recent
    .filter((m) => m.hrv?.avg != null && m.hrv.avg > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => m.hrv!.avg);
  const hrv = hrvSeries.length ? hrvSeries.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, hrvSeries.length) : undefined;
  const hrvBase = baseline((m) => (m.hrv?.avg != null && m.hrv.avg > 0 ? Math.log(m.hrv.avg) : undefined));
  if (hrv != null && hrv > 0 && hrvBase.mean != null) {
    const v = zSub(Math.log(hrv), hrvBase, true);
    if (v != null) {
      signals.push({ value: v, weight: 0.3 });
      drivers.push(`HRV ${Math.round(hrv)}ms ${Math.log(hrv) >= hrvBase.mean ? '↑' : '↓'} vs ${Math.round(Math.exp(hrvBase.mean))}`);
    }
  }

  // Resting HR — z-score; lower is better
  const rhr = latest.restingHr;
  const rhrBase = baseline((m) => m.restingHr);
  if (rhr != null && rhrBase.mean != null) {
    const v = zSub(rhr, rhrBase, false);
    if (v != null) {
      signals.push({ value: v, weight: 0.2 });
      drivers.push(`RHR ${Math.round(rhr)}bpm ${rhr <= rhrBase.mean ? '↓' : '↑'} vs ${Math.round(rhrBase.mean)}`);
    }
  }

  // Sleep — Apple Watch night + any manual log, de-duplicated (a separate nap adds,
  // a re-logged night doesn't double-count). Duration vs ~8h; quality from watch
  // deep+REM stages, or from the manual self-rating when there are no stages.
  const sleepMin = combinedSleepMin(latest);
  if (sleepMin != null) {
    const dur = clamp((sleepMin / 480) * 100);
    const st = latest.sleep?.stages;
    let sub = dur;
    if (st && ((st.deep ?? 0) + (st.rem ?? 0)) > 0) {
      const total = (st.deep ?? 0) + (st.rem ?? 0) + (st.core ?? 0) + (st.awake ?? 0);
      const restorative = total > 0 ? ((st.deep ?? 0) + (st.rem ?? 0)) / total : 0;
      sub = dur * 0.6 + clamp((restorative / 0.45) * 100) * 0.4; // ~45% deep+REM = good
    } else if (latest.manualSleep?.quality != null) {
      // No stages (manual-only) — blend duration with his self-rated quality (1-5).
      sub = dur * 0.6 + clamp(((latest.manualSleep.quality - 1) / 4) * 100) * 0.4;
    }
    signals.push({ value: sub, weight: 0.25 });
    drivers.push(`${Math.floor(sleepMin / 60)}h ${Math.round(sleepMin % 60)}m sleep`);
  }

  // Respiratory rate — z-score; elevated vs baseline signals strain/illness
  const rr = latest.respiratoryRate;
  const rrBase = baseline((m) => m.respiratoryRate);
  if (rr != null && rrBase.mean != null) {
    const v = zSub(rr, rrBase, false, 15);
    if (v != null) {
      signals.push({ value: v, weight: 0.1 });
      if (rrBase.mean && rr > rrBase.mean * 1.05) drivers.push(`Resp rate ${rr.toFixed(1)} ↑`);
    }
  }

  // Wrist temperature — z-score; above baseline is worse (illness/under-recovery)
  const temp = latest.wristTempC;
  const tempBase = baseline((m) => m.wristTempC);
  if (temp != null && tempBase.mean != null) {
    const v = zSub(temp, tempBase, false, 15);
    if (v != null) {
      signals.push({ value: v, weight: 0.07 });
      if (Math.abs(temp - tempBase.mean) >= 0.3) drivers.push(`Wrist temp ${temp - tempBase.mean >= 0 ? '+' : ''}${(temp - tempBase.mean).toFixed(1)}°C`);
    }
  }

  // SpO2 — gentle; Apple's overnight reading is noisy, so low weight
  const spo2 = latest.spo2;
  if (spo2 != null) {
    signals.push({ value: clamp(55 + (spo2 - 96) * 6), weight: 0.06 });
    if (spo2 < 95) drivers.push(`SpO₂ ${Math.round(spo2)}%`);
  }

  // Hydration — self-logged water vs a bodyweight-based target (~35 ml/kg, i.e.
  // ~0.14 glasses/kg). Mild input, only when tracked. Active days need more.
  const water = latest.waterGlasses;
  if (water != null) {
    const wkg = latest.weightKg ?? others.find((m) => m.weightKg != null)?.weightKg;
    const target = wkg ? Math.max(8, Math.round((wkg * 35) / 250)) : 12; // glasses (~3L default)
    signals.push({ value: clamp(40 + (water / target) * 60), weight: 0.05 });
    if (water < target * 0.6) drivers.push(`Water ${water}/${target}`);
  }

  // Subjective readiness from today's journal — self-report is highly predictive
  const j = inputs?.journal;
  if (j) {
    const parts: number[] = [];
    if (j.energy != null) parts.push(((j.energy - 1) / 4) * 100);
    if (j.soreness != null) parts.push(((5 - j.soreness) / 4) * 100); // more sore = worse
    if (j.stress != null) parts.push(((5 - j.stress) / 4) * 100); // more stress = worse
    if (j.mood != null) parts.push(((j.mood - 1) / 4) * 100);
    if (parts.length) {
      signals.push({ value: clamp(parts.reduce((a, b) => a + b, 0) / parts.length), weight: 0.15 });
      if (j.soreness != null && j.soreness >= 4) drivers.push('Sore');
      else if (j.energy != null && j.energy <= 2) drivers.push('Low energy');
    }
  }

  // Nutrition adequacy (yesterday's fuel vs targets) — mild
  const nut = inputs?.nutrition;
  if (nut && (nut.calTarget || nut.proTarget)) {
    const ratios: number[] = [];
    if (nut.calTarget && nut.calories != null) ratios.push(Math.min(1.1, nut.calories / nut.calTarget));
    if (nut.proTarget && nut.protein != null) ratios.push(Math.min(1.1, nut.protein / nut.proTarget));
    if (ratios.length) {
      const adq = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      signals.push({ value: clamp(40 + Math.min(1, adq) * 60), weight: 0.05 });
      if (adq < 0.7) drivers.push('Under-fuelled');
    }
  }

  if (!signals.length) return null;
  const wsum = signals.reduce((s, x) => s + x.weight, 0);
  let score = Math.round(signals.reduce((s, x) => s + x.value * x.weight, 0) / wsum);

  // Prior-day training strain — only ever lowers (a hard yesterday = less recovered).
  // When HRV is reliable, last night's HRV ALREADY reflects yesterday's load, so a full
  // penalty double-counts it (let HRV speak). Apply only a small residual
  // there; keep the full penalty as a fallback for users without trustworthy HRV.
  const hrvStrong = hrv != null && hrv > 0 && hrvBase.n >= 7;
  if (inputs?.priorStrainAU && inputs.priorStrainAU > 0) {
    const raw = Math.min(12, Math.max(0, (inputs.priorStrainAU - 250) / 25));
    const penalty = hrvStrong ? raw * 0.25 : raw;
    if (penalty >= 1) {
      score -= penalty;
      if (penalty >= 4) drivers.push('Hard session yesterday');
    }
  }
  // Illness overrides — cap low and flag first
  if (j?.ill) {
    score = Math.min(score, 30);
    drivers.unshift('Feeling ill — prioritise rest');
  }
  score = Math.round(clamp(score));
  // Low confidence when the physiological core is thin: no HRV, or too small a baseline.
  const confidence: 'high' | 'low' = hrvStrong ? 'high' : 'low';
  return { score, band: band(score), label: readinessLabel(score), drivers: drivers.slice(0, 4), confidence };
}
