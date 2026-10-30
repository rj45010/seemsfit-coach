import { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, Link2, Plus, RotateCcw, TrendingDown, X } from 'lucide-react';
import type { ExerciseSetEntry, PlanExercise } from '@/lib/types';
import { RpeInfo } from '@/features/workouts/components/RpeInfo';
import { suggestExercise } from '@/lib/progression';
import { NumberPicker, range, nearest, type PickerValue } from '@/components/ui/NumberPicker';
import { useMetricsRange } from '@/hooks/useMetrics';
import { readDraft, writeDraft } from '@/lib/drafts';
import { startRest } from '@/lib/restTimer';

// Colour dot per progression kind (matches the old Today suggestion card).
const KIND_DOT: Record<string, string> = {
  up: 'var(--color-sys-green)',
  rep: 'var(--color-sys-blue)',
  hold: 'var(--color-sys-orange)',
  log: 'var(--color-sys-gray)',
};

const WEIGHT_INT: PickerValue[] = ['BW', ...range(0, 300, 1)]; // bodyweight + whole kg
const WEIGHT_DEC: PickerValue[] = ['.0', '.25', '.5', '.75']; // fractional kg
const REPS_OPTS: PickerValue[] = [...range(0, 50, 1), 'F'];
const RPE_OPTS: PickerValue[] = ['—', ...range(6, 10, 0.5)];

/** Split a stored weight string into whole + fractional wheel values. */
function splitWeight(w: string): { int: number; dec: PickerValue } {
  const v = w === '' ? 0 : Number(w);
  if (!isFinite(v)) return { int: 0, dec: '.0' };
  const int = Math.floor(v);
  const frac = Math.round((v - int) * 100);
  const dec: PickerValue = frac >= 63 ? '.75' : frac >= 38 ? '.5' : frac >= 13 ? '.25' : '.0';
  return { int, dec };
}

interface Row {
  weight: string;
  reps: string;
  rpe: string;
  isDrop: boolean;
}

/** Seed the editable rows from last-logged sets, else from the planned sets×reps. */
function seedRows(ex: PlanExercise): Row[] {
  if (ex.loggedSets && ex.loggedSets.length > 0) {
    return ex.loggedSets.map((s) => ({
      // bodyweight sets stored the actual kg in DB but show as "BW" in the editor
      weight: s.bodyweight ? 'BW' : s.weight === '' || s.weight == null ? '' : String(s.weight),
      reps: s.reps == null ? '' : String(s.reps),
      rpe: s.rpe == null ? '' : String(s.rpe),
      isDrop: !!s.isDrop,
    }));
  }
  const n = Math.max(1, ex.sets || 1);
  const reps = ex.reps == null ? '' : String(ex.reps);
  return Array.from({ length: n }, () => ({ weight: '', reps, rpe: '', isDrop: false }));
}

/** Resolve rows to DB entries. Bodyweight sets save the actual `bodyweight` kg. */
function toEntries(rows: Row[], bodyweight: number | null): ExerciseSetEntry[] {
  return rows.map((r) => {
    const isBW = r.weight.trim().toUpperCase() === 'BW';
    const isFail = r.reps.trim().toUpperCase() === 'F';
    // Reps to failure ⇒ RPE 10 (no reps left), unless a value is already set.
    const rpe = isFail && !r.rpe.trim() ? 10 : Number(r.rpe);
    return {
      weight: isBW ? (bodyweight ?? '') : r.weight.trim(),
      reps: isFail ? 'F' : Number(r.reps) || 0,
      isDrop: r.isDrop,
      ...(isBW ? { bodyweight: true } : {}),
      ...((isFail || (r.rpe.trim() && rpe >= 1)) && rpe <= 10 ? { rpe } : {}),
    };
  });
}

export function ExerciseLogRow({
  exercise,
  index,
  onChange,
  defaultOpen = false,
  draftKey,
  group,
  siblings = [],
  onSuperset,
  editableName = false,
  onRename,
  onRemove,
  skippable = false,
  skipped = false,
  onToggleSkip,
}: {
  exercise: PlanExercise;
  index: number;
  onChange: (index: number, sets: ExerciseSetEntry[]) => void;
  /** Start expanded. Default collapsed so opening a day doesn't unfurl everything. */
  defaultOpen?: boolean;
  /** localStorage key — unsaved edits persist here so they survive app close. */
  draftKey?: string;
  /** Superset group styling (label + colour) when this exercise is grouped. */
  group?: { label: string; color: string };
  /** Other exercises in the session, to pick a superset partner. */
  siblings?: { index: number; name: string }[];
  /** Link with another exercise (its index) or unlink (null). */
  onSuperset?: (other: number | null) => void;
  /** Manual logging: let the user type/rename the exercise + remove the whole row. */
  editableName?: boolean;
  onRename?: (name: string) => void;
  onRemove?: () => void;
  /** Plan logging: let the user skip this exercise for THIS session only (plan unchanged). */
  skippable?: boolean;
  skipped?: boolean;
  onToggleSkip?: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  // Restore an in-progress draft if one exists, else seed from last-logged/plan.
  const [rows, setRows] = useState<Row[]>(() => {
    if (draftKey) {
      const d = readDraft<Row[]>(draftKey);
      if (d && d.length) return d;
    }
    return seedRows(exercise);
  });
  const [open, setOpen] = useState(defaultOpen);
  const [pick, setPick] = useState<{ i: number; kind: 'wr' | 'rpe' } | null>(null);

  // Progressive-overload hint from last time's sets — shown right where you log, so you know
  // what to aim for this set (moved here from the old Today "suggestion" card).
  const suggestion = useMemo(() => suggestExercise(exercise), [exercise]);

  // Current bodyweight (latest non-null) — used to resolve "BW" sets to real kg on save.
  const { data: metrics } = useMetricsRange(90);
  const bodyweight = useMemo(() => {
    for (const m of [...(metrics ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
      if (m.weightKg != null) return m.weightKg;
    }
    return null;
  }, [metrics]);

  // Report up on every edit (including mount). `onChange` is a stable callback.
  useEffect(() => {
    onChange(index, toEntries(rows, bodyweight));
    if (draftKey) writeDraft(draftKey, rows); // persist in-progress edits
  }, [rows, index, onChange, bodyweight, draftKey]);

  const name = exercise.exName || exercise.name;

  function addSet() {
    setRows((p) => {
      const last = p[p.length - 1];
      return [...p, { weight: last?.weight ?? '', reps: last?.reps ?? '', rpe: last?.rpe ?? '', isDrop: false }];
    });
  }
  function removeSet(i: number) {
    setRows((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  }
  function addDropSet() {
    setRows((p) => {
      const last = p[p.length - 1];
      return [...p, { weight: last?.weight ?? '', reps: '', rpe: '', isDrop: true }];
    });
  }

  return (
    <div
      className="bg-surface overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-ink)_12%,transparent)]"
      style={group ? { borderLeftWidth: 4, borderLeftColor: group.color } : undefined}
    >
      <div className={`flex w-full items-center gap-2 p-3 ${skipped ? 'opacity-50' : ''}`}>
        {editableName ? (
          <input
            value={exercise.exName || exercise.name}
            onChange={(e) => onRename?.(e.target.value)}
            placeholder="Exercise name"
            className="placeholder:text-ink-3 min-w-0 flex-1 bg-transparent font-bold outline-none"
          />
        ) : (
          <button onClick={() => !skipped && setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center text-left" aria-expanded={open}>
            <div className="min-w-0 flex-1">
              <p className={`truncate font-bold ${skipped ? 'line-through' : ''}`}>{name}</p>
              {skipped ? (
                <span className="eyebrow text-ink-3">Skipped this session</span>
              ) : group ? (
                <span className="eyebrow" style={{ color: group.color }}>Superset {group.label}</span>
              ) : null}
            </div>
          </button>
        )}
        {!skipped && (
          <span className="bg-butter shrink-0 rounded-lg px-2 py-0.5 font-mono text-xs font-semibold">
            {rows.length}{exercise.reps ? ` × ${exercise.reps}` : ' sets'}
          </span>
        )}
        {skippable && onToggleSkip && (
          <button onClick={onToggleSkip} aria-label={skipped ? 'Include exercise' : 'Skip exercise'} className="text-ink-3 shrink-0">
            {skipped ? <RotateCcw size={16} strokeWidth={2.6} /> : <Ban size={16} strokeWidth={2.6} />}
          </button>
        )}
        {!skipped && (
          <button onClick={() => setOpen((o) => !o)} aria-label="Expand" className="shrink-0">
            <ChevronDown size={16} strokeWidth={3} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        {editableName && onRemove && (
          <button onClick={onRemove} aria-label="Remove exercise" className="text-ink-3 shrink-0">
            <X size={16} strokeWidth={3} />
          </button>
        )}
      </div>

      {open && !skipped && (
        <div className="px-3 pb-3">
          {/* Progressive-overload suggestion — what to aim for this session */}
          <div
            className="mb-2.5 flex items-start gap-2 rounded-xl px-3 py-2"
            style={{ background: 'color-mix(in srgb, var(--color-lavender) 22%, transparent)' }}
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[suggestion.kind] }} />
            <div className="min-w-0">
              <p className="eyebrow text-[9px]">Suggested</p>
              <p className="text-ink-2 text-xs font-semibold leading-snug">
                {suggestion.last ? <span className="text-ink-3">{suggestion.last} → </span> : null}
                {suggestion.text}
              </p>
            </div>
          </div>
          <div className="text-ink-3 mb-1 flex items-center justify-between text-[10px] font-bold uppercase">
            <span>kg × reps</span>
            <span className="flex items-center gap-0.5">RPE<RpeInfo /></span>
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs font-bold" style={{ color: r.isDrop ? 'color-mix(in srgb, var(--color-peach) 45%, var(--color-ink))' : 'var(--color-ink-3)' }}>
                  {r.isDrop ? <TrendingDown size={13} strokeWidth={2.5} className="mx-auto" /> : i + 1}
                </span>
                <button
                  onClick={() => setPick({ i, kind: 'wr' })}
                  className="flex-1 rounded-xl bg-sys-fill-2 px-3 py-2.5 text-left text-sm font-semibold transition-transform active:scale-[0.98]"
                >
                  {r.weight || r.reps ? (
                    <>
                      {r.weight || '—'}
                      {r.weight && r.weight !== 'BW' && <span className="text-ink-3">kg</span>} × {r.reps || '—'}
                    </>
                  ) : (
                    <span className="text-ink-3">Tap to log set</span>
                  )}
                </button>
                <button
                  onClick={() => setPick({ i, kind: 'rpe' })}
                  className="w-14 shrink-0 rounded-xl bg-sys-fill-2 px-2 py-2.5 text-center text-sm font-semibold transition-transform active:scale-[0.98]"
                  aria-label="Set RPE"
                >
                  {r.rpe ? `@${r.rpe}` : <span className="text-ink-3">RPE</span>}
                </button>
                <button
                  onClick={() => removeSet(i)}
                  disabled={rows.length <= 1}
                  className="text-ink-3 flex shrink-0 items-center justify-center disabled:opacity-30"
                  aria-label="Remove set"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button onClick={addSet} className="text-ink-2 flex items-center gap-1 text-xs font-bold">
              <Plus size={12} strokeWidth={3} /> Add set
            </button>
            {onSuperset && (
              <button
                onClick={() => setLinkOpen((v) => !v)}
                aria-label="Superset"
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{
                  color: group ? group.color : 'color-mix(in srgb, var(--color-lavender) 60%, var(--color-ink))',
                  background: linkOpen || group ? 'color-mix(in srgb, var(--color-lavender) 22%, transparent)' : 'color-mix(in srgb, var(--color-ink) 7%, transparent)',
                }}
              >
                <Link2 size={12} strokeWidth={3} /> Superset
              </button>
            )}
            <button
              onClick={addDropSet}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{ color: 'color-mix(in srgb, var(--color-peach) 45%, var(--color-ink))', background: 'color-mix(in srgb, var(--color-peach) 28%, transparent)' }}
            >
              <TrendingDown size={12} strokeWidth={3} /> Add drop set
            </button>
          </div>

          {linkOpen && onSuperset && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group && (
                <button onClick={() => { onSuperset(null); setLinkOpen(false); }} className="text-ink rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] px-3 py-1.5 text-xs font-semibold">
                  Make separate
                </button>
              )}
              {siblings.map((s) => (
                <button
                  key={s.index}
                  onClick={() => { onSuperset(s.index); setLinkOpen(false); }}
                  className="text-ink rounded-full bg-[color-mix(in_srgb,var(--color-lavender)_18%,transparent)] px-3 py-1.5 text-xs font-semibold"
                >
                  + {s.name}
                </button>
              ))}
              {siblings.length === 0 && <span className="text-ink-3 text-xs font-semibold">No other exercises</span>}
            </div>
          )}

          {pick?.kind === 'wr' && (() => {
            const w = rows[pick.i].weight;
            const isBW = w === 'BW';
            const { int, dec } = splitWeight(w);
            const reps = rows[pick.i].reps;
            return (
              <NumberPicker
                title={name}
                subtitle={`Set ${pick.i + 1}`}
                saveLabel="Log"
                quickActions={[
                  { label: bodyweight != null ? `Bodyweight · ${bodyweight}kg` : 'Bodyweight', colIndex: 0, value: 'BW' },
                  { label: 'To failure', colIndex: 2, value: 'F' },
                ]}
                columns={[
                  { label: 'kilos / BW', options: WEIGHT_INT, initialValue: isBW ? 'BW' : nearest(WEIGHT_INT, int), flex: 1.2 },
                  { label: '', options: WEIGHT_DEC, initialValue: dec, flex: 0.8 },
                  { label: 'reps', options: REPS_OPTS, initialValue: reps.toUpperCase() === 'F' ? 'F' : nearest(REPS_OPTS, reps === '' ? undefined : Number(reps)), flex: 1 },
                ]}
                onClose={() => setPick(null)}
                onSave={([whole, frac, rp]) => {
                  const weight = whole === 'BW' ? 'BW' : String(Number(whole) + parseFloat(String(frac)));
                  const failed = rp === 'F';
                  setRows((p) => p.map((row, idx) => (idx === pick.i ? {
                    ...row,
                    weight,
                    reps: failed ? 'F' : String(rp),
                    // To failure ⇒ RPE 10 automatically (unless you set one)
                    rpe: failed && !row.rpe ? '10' : row.rpe,
                  } : row)));
                  setPick(null);
                }}
              />
            );
          })()}

          {pick?.kind === 'rpe' && (
            <NumberPicker
              title={name}
              subtitle={`Set ${pick.i + 1} · RPE — how hard? (10 = no reps left)`}
              saveLabel="Log"
              columns={[
                { label: 'RPE', options: RPE_OPTS, initialValue: rows[pick.i].rpe === '' ? '—' : nearest(RPE_OPTS, Number(rows[pick.i].rpe)) },
              ]}
              onClose={() => setPick(null)}
              onSave={([rpe]) => {
                setRows((p) => p.map((row, idx) => (idx === pick.i ? { ...row, rpe: rpe === '—' ? '' : String(rpe) } : row)));
                setPick(null);
                startRest(); // logging RPE also (re)starts the rest countdown
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
