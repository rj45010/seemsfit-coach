import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges conditional classes and dedupes conflicts (later wins)', () => {
    expect(cn('p-2', false && 'hidden', 'p-4')).toBe('p-4');
    expect(cn('text-ink', ['font-bold'])).toBe('text-ink font-bold');
  });
});
