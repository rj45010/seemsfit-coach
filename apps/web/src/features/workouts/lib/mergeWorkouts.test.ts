import { describe, it, expect } from 'vitest';
import { planStrengthMerges } from './mergeWorkouts';
import type { Workout } from '@/lib/types';

// Watch session: starts 20:00, 75 min long → window [20:00 … 21:15], padded 10 min each side.
const WATCH_START = '2026-07-06T20:00:00.000Z';
const at = (hhmm: string) => `2026-07-06T${hhmm}:00.000Z`;

const w = (o: Partial<Workout>): Workout => ({ id: 'x', category: 'Strength', ...o }) as Workout;
const SETS = [{ name: 'Bench', supersetId: null, sets: [{ weight: 60, reps: 8, isDrop: false }] }];

const watch = (o: Partial<Workout> = {}) =>
  w({ id: 'watch', source: 'watch', createdAt: WATCH_START, duration: 75, calories: 543, avgHr: 128, effort: 7, ...o });
const phone = (o: Partial<Workout> = {}) =>
  w({ id: 'phone', source: 'manual', exerciseSets: SETS, ...o });

describe('planStrengthMerges (time-proximity)', () => {
  it('merges when the phone log is created DURING the watch session', () => {
    const ops = planStrengthMerges([phone({ createdAt: at('20:30') }), watch()]);
    expect(ops).toHaveLength(1);
    expect(ops[0].keepId).toBe('phone');
    expect(ops[0].dropId).toBe('watch');
    expect(ops[0].patch).toMatchObject({ calories: 543, avgHr: 128, effort: 7, watchMerged: true });
    expect(ops[0].patch).not.toHaveProperty('exerciseSets'); // phone weights untouched
  });

  it('merges when created just after the session ends (within 10-min pad)', () => {
    expect(planStrengthMerges([phone({ createdAt: at('21:22') }), watch()])).toHaveLength(1); // 7 min after 21:15
  });

  it('merges when created just before the session (within 10-min pad)', () => {
    expect(planStrengthMerges([phone({ createdAt: at('19:53') }), watch()])).toHaveLength(1); // 7 min before 20:00
  });

  it('a lone watch+phone pair merges regardless of the time gap (1+1 rule ignores the window)', () => {
    // Same day, one of each → the same session even if the weights were typed hours later.
    const ops = planStrengthMerges([phone({ createdAt: at('23:30') }), watch()]); // 2h+ after the session ended
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ keepId: 'phone', dropId: 'watch' });
  });

  it('does NOT pair a phone log outside every watch window on a MULTI-session day', () => {
    // Two watch sessions → time-window pairing applies. A phone log 25 min after session A's end
    // (and far from B) matches neither window, so it stays unmerged (the 10-min pad only guards
    // multi-session days; a lone 1+1 pair merges outright per the case above).
    const ops = planStrengthMerges([
      watch({ id: 'wA' }), // [20:00 … 21:15]
      w({ id: 'wB', source: 'watch', createdAt: at('08:00'), duration: 60 }), // [08:00 … 09:00]
      phone({ createdAt: at('21:40') }), // 25 min after A, far from B
    ]);
    expect(ops).toEqual([]);
  });

  it('borrows watch sets only when the phone log has none', () => {
    const ops = planStrengthMerges([
      phone({ exerciseSets: undefined, createdAt: at('20:10') }),
      watch({ exerciseSets: SETS }),
    ]);
    expect(ops[0].patch.exerciseSets).toEqual(SETS);
  });

  it('keeps two separate same-day sessions apart', () => {
    const ops = planStrengthMerges([
      phone({ id: 'pA', createdAt: at('08:10') }),
      w({ id: 'wA', source: 'watch', createdAt: at('08:00'), duration: 60, calories: 300 }),
      phone({ id: 'pB', createdAt: at('20:10') }),
      w({ id: 'wB', source: 'watch', createdAt: at('20:00'), duration: 60, calories: 400 }),
    ]);
    expect(ops).toHaveLength(2);
    expect(ops.find((o) => o.dropId === 'wA')?.keepId).toBe('pA');
    expect(ops.find((o) => o.dropId === 'wB')?.keepId).toBe('pB');
  });

  it('does nothing with only one side present', () => {
    expect(planStrengthMerges([phone({ createdAt: at('20:10') })])).toEqual([]);
    expect(planStrengthMerges([watch()])).toEqual([]);
  });

  it('is idempotent — an already-merged phone log is left alone', () => {
    expect(planStrengthMerges([phone({ createdAt: at('20:10'), watchMerged: true }), watch()])).toEqual([]);
  });

  it('merges an Apple Health session (source appleHealth / ahk_, no sets) into the phone log', () => {
    // The real July-6 shape: a phone weights log (source undefined, has sets) + an Apple Health
    // session 77 min earlier (source appleHealth, only duration/calories). 1+1 → merge outright.
    const ops = planStrengthMerges([
      w({ id: 'keep', source: undefined, exerciseSets: SETS, createdAt: at('14:23') }),
      w({ id: 'ahk_x', source: 'appleHealth', createdAt: at('13:06'), duration: 75, calories: 543 }),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ keepId: 'keep', dropId: 'ahk_x' });
    expect(ops[0].patch).toMatchObject({ calories: 543, duration: 75, watchMerged: true });
    expect(ops[0].patch).not.toHaveProperty('exerciseSets'); // phone weights untouched
  });

  it('ignores non-strength categories', () => {
    const ops = planStrengthMerges([
      w({ id: 'r1', category: 'Running', source: 'watch', createdAt: at('20:00'), duration: 30 }),
      w({ id: 'r2', category: 'Running', source: 'manual', createdAt: at('20:05') }),
    ]);
    expect(ops).toEqual([]);
  });
});
