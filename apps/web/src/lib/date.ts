import { format, parseISO, isValid } from 'date-fns';
import type { TimeLike } from './types';

/** Coerce any Firestore/JS/ISO time value into a Date (or null). */
export function toDate(value: TimeLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  // Firestore Timestamp
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const d = value.toDate();
    return isValid(d) ? d : null;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  if (typeof value === 'string') {
    const d = parseISO(value);
    return isValid(d) ? d : null;
  }
  return null;
}

/** Local-time YYYY-MM-DD for a given date (never UTC — matches the user's calendar day). */
export const dateKey = (d: Date): string => format(d, 'yyyy-MM-dd');

export const todayKey = (): string => dateKey(new Date());

/** A new Date `n` days from `d` (n may be negative). Does not mutate `d`. */
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Shift a YYYY-MM-DD key by `delta` days (for day-by-day paging). */
export const shiftDayKey = (key: string, delta: number): string => {
  const d = parseISO(key);
  return isValid(d) ? dateKey(addDays(d, delta)) : key;
};

/** True when a YYYY-MM-DD key is after today (used to stop forward paging). */
export const isFutureDayKey = (key: string): boolean => key > todayKey();

export function fmtDate(value: TimeLike, pattern = 'd MMM yyyy'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

export function fmtDayKey(key: string, pattern = 'd MMM'): string {
  const d = parseISO(key);
  return isValid(d) ? format(d, pattern) : key;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
