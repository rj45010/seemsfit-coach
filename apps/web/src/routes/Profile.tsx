import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { BackHeader } from '@/components/ui/BackHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useMemory, useSaveProfile, type UserProfile } from '@/hooks/useMemory';
import { useMetricsRange } from '@/hooks/useMetrics';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { num } from '@/lib/format';
import { bodyAgeReadout } from '@/lib/bodyAge';
import { WeightDialog } from '@/components/today/WeightDialog';
import type { DailyMetrics } from '@/lib/types';

const field =
  'w-full min-w-0 appearance-none rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

function ageFrom(birthDate?: string): number | null {
  if (!birthDate) return null;
  const a = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86_400_000));
  return a > 0 && a < 120 ? a : null;
}

function BodyStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-sys-fill-2 px-3 py-2 text-center">
      <p className="big-number text-2xl">
        {value}
        {unit && value !== '—' && <span className="text-ink-2 ml-0.5 text-sm font-bold">{unit}</span>}
      </p>
      <p className="eyebrow mt-0.5">{label}</p>
    </div>
  );
}

export default function Profile() {
  const { data, isLoading } = useMemory();
  const saveProfile = useSaveProfile();
  const { openJarvis } = useJarvis();
  const { data: metrics } = useMetricsRange(180);

  const [profile, setProfile] = useState<UserProfile>({});
  const [dirty, setDirty] = useState(false);
  const [showWeight, setShowWeight] = useState(false);

  useEffect(() => {
    if (data) setProfile(data.profile);
  }, [data]);

  const setP = (patch: Partial<UserProfile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  // Latest non-null body composition — auto-sourced from BMI/InBody reports.
  const latest = useMemo(() => {
    const sorted = [...(metrics ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    const pick = (f: (m: DailyMetrics) => number | undefined) => {
      for (const m of sorted) {
        const v = f(m);
        if (v != null) return v;
      }
      return undefined;
    };
    return {
      weightKg: pick((m) => m.weightKg),
      bodyFatPct: pick((m) => m.bodyFatPct),
      bmi: pick((m) => m.bmi),
      vo2Max: pick((m) => m.vo2Max),
    };
  }, [metrics]);

  const age = ageFrom(profile.birthDate);
  const body = bodyAgeReadout(latest.vo2Max, profile.sex, age);

  async function save() {
    await saveProfile.mutateAsync(profile);
    setDirty(false);
  }

  return (
    <>
      <BackHeader to="/health" />
      <PageHeader eyebrow="You" title="Profile" />

      {/* Body composition — read-only, auto-updates from BMI reports */}
      <Card accent="surface" className="mb-4">
        <p className="eyebrow mb-3">Body composition</p>
        <div className="grid grid-cols-3 gap-2">
          <BodyStat label="Weight" value={latest.weightKg != null ? num(latest.weightKg, 1) : '—'} unit="kg" />
          <BodyStat label="Body fat" value={latest.bodyFatPct != null ? num(latest.bodyFatPct, 1) : '—'} unit="%" />
          <BodyStat label="BMI" value={latest.bmi != null ? num(latest.bmi, 1) : '—'} />
        </div>
        <p className="text-ink-3 mt-3 text-[11px] font-semibold leading-relaxed">
          Enter it yourself, or share a BMI / InBody report with Vyom (photo or PDF) to fill it in automatically.
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="ink" className="flex-1" onClick={() => setShowWeight(true)}>
            Enter weight
          </Button>
          <Button variant="surface" className="flex-1" onClick={() => openJarvis('Here is my latest body composition report — ')}>
            Upload a report
          </Button>
        </div>
      </Card>

      {showWeight && <WeightDialog currentKg={latest.weightKg} onClose={() => setShowWeight(false)} />}

      {/* Body Age — VO2-max fitness age vs population norms for your age/sex */}
      {body && (
        <Card accent="surface" className="mb-4">
          <p className="eyebrow mb-2">Body Age</p>
          <div className="flex items-end gap-3">
            <p className="big-number text-4xl">{body.age}</p>
            {body.delta != null && body.delta !== 0 && (
              <p
                className="mb-1 text-sm font-bold"
                style={{ color: body.delta > 0 ? 'var(--color-sys-green)' : 'var(--color-sys-orange)' }}
              >
                {Math.abs(body.delta)}y {body.delta > 0 ? 'younger' : 'older'} than your age
              </p>
            )}
          </div>
          <p className="text-ink-3 mt-2 text-[11px] font-semibold leading-relaxed">
            The age at which the average person's aerobic fitness (VO₂ max) matches yours. Lower is
            fitter. Needs your VO₂ max (from Apple Health), plus your birth date and sex above.
          </p>
        </Card>
      )}

      {/* Stable profile — set once, edit rarely */}
      <Card accent="surface">
        <p className="eyebrow mb-1">About you</p>
        <p className="text-ink-3 mb-3 text-[11px] font-semibold">
          The basics Vyom uses to personalise programming, macros and norms.
        </p>
        {isLoading ? (
          <p className="text-ink-3 text-sm font-semibold">Loading…</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="text-ink-3 text-[10px] font-bold uppercase tracking-wide">Birth date{age != null ? ` · ${age}y` : ''}</span>
                <input type="date" max={new Date().toISOString().slice(0, 10)} className={field} value={profile.birthDate ?? ''} onChange={(e) => setP({ birthDate: e.target.value })} />
              </label>
              <label className="w-24">
                <span className="text-ink-3 text-[10px] font-bold uppercase tracking-wide">Height cm</span>
                <input type="number" inputMode="numeric" className={field} value={profile.heightCm ?? ''} onChange={(e) => setP({ heightCm: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
            </div>
            <label>
              <span className="text-ink-3 text-[10px] font-bold uppercase tracking-wide">Sex (for norms)</span>
              <select className={field} value={profile.sex ?? ''} onChange={(e) => setP({ sex: (e.target.value || undefined) as UserProfile['sex'] })}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <input className={field} placeholder="Training age — e.g. 5 yrs lifting, 2 running" value={profile.trainingAge ?? ''} onChange={(e) => setP({ trainingAge: e.target.value })} />
            <input className={field} placeholder="Goals — e.g. build strength, sub-25 5K" value={profile.goals ?? ''} onChange={(e) => setP({ goals: e.target.value })} />
            <input className={field} placeholder="Equipment — e.g. full gym + home dumbbells" value={profile.equipment ?? ''} onChange={(e) => setP({ equipment: e.target.value })} />
            <input className={field} placeholder="Diet — prefs/allergies, e.g. vegetarian" value={profile.diet ?? ''} onChange={(e) => setP({ diet: e.target.value })} />
            {dirty && (
              <Button variant="ink" className="mt-1" onClick={save} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="text-ink-3 mt-6 mb-2 flex justify-center gap-4 text-xs font-bold">
        <Link to="/terms" className="underline">Terms of Service</Link>
        <Link to="/terms?tab=privacy" className="underline">Privacy Policy</Link>
      </div>
    </>
  );
}
