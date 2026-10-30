import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes safely: `clsx` resolves conditionals/arrays, `twMerge`
 * dedupes conflicting utilities so later classes win (e.g. cn('p-2', p ? 'p-4' : '')).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
