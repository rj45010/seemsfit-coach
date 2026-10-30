import { describe, it, expect } from 'vitest';
import { mealDraftSchema, mealFormSchema, toMealDraft } from './meal.schema';

describe('mealDraftSchema (shared manual + AI payload)', () => {
  it('accepts a valid meal', () => {
    const r = mealDraftSchema.safeParse({ name: 'Chicken rice', calories: 600, protein: 45 });
    expect(r.success).toBe(true);
  });

  it('rejects a blank name and negative calories', () => {
    expect(mealDraftSchema.safeParse({ name: '  ', calories: 100 }).success).toBe(false);
    expect(mealDraftSchema.safeParse({ name: 'x', calories: -5 }).success).toBe(false);
  });
});

describe('mealFormSchema (manual form)', () => {
  it('coerces string inputs to numbers', () => {
    const r = mealFormSchema.parse({ name: 'Eggs', calories: '160', protein: '12', carbs: '', fat: '11' });
    expect(r.calories).toBe(160);
    expect(r.protein).toBe(12);
    expect(r.carbs).toBeUndefined();
  });

  it('requires at least one of calories or macros', () => {
    const r = mealFormSchema.safeParse({ name: 'Water', calories: '', protein: '', carbs: '', fat: '' });
    expect(r.success).toBe(false);
  });

  it('derives calories from macros when blank (4/4/9)', () => {
    const parsed = mealFormSchema.parse({ name: 'Shake', calories: '', protein: '30', carbs: '20', fat: '10' });
    const draft = toMealDraft(parsed, '2026-07-02');
    expect(draft.calories).toBe(30 * 4 + 20 * 4 + 10 * 9); // 290
    expect(draft.date).toBe('2026-07-02');
  });
});
