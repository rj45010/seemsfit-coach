import type { ReactElement, ReactNode } from 'react';
import { catMeta } from '@/lib/workoutMeta';
import { iconForType } from '@/lib/workoutTypes';
import { duration as fmtDur, km, kcal, num } from '@/lib/format';
import { fmtDate, toDate } from '@/lib/date';
import type { Workout } from '@/lib/types';
import { isCardio } from '@/lib/workoutMeta';

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, "SF Pro Text", system-ui, Inter, sans-serif';
const IMSG_BLUE = '#0b93f6'; // iMessage sent-bubble blue

export type ShareInk = 'white' | 'black';

interface Stat {
  label: string;
  value: string;
}

export interface TplCtx {
  ink: string;
  sub: string;
  shadow: string;
  hero: Stat;
  unit: string;
  rest: Stat[];
  cells: Stat[]; // hero + rest, for grid/row layouts
  bubble: string; // punchy one-line summary for the message template
  note: string; // optional user caption for the iOS note card
  title: string;
  category: string;
  dateStr: string;
  timeStr: string;
  weekday: string;
  verb: string;
  icon: ReactNode;
}

const VERB: Record<string, string> = {
  Running: 'Ran',
  Cycling: 'Rode',
  Walking: 'Walked',
  Hiking: 'Hiked',
  Swimming: 'Swam',
};

interface StatC extends Stat {
  unit?: string;
}

const filled = (s: StatC) => s.value && s.value !== '—' && s.value !== '0';

function statsFor(w: Workout): { hero: Stat; rest: Stat[]; unit: string; bubble: string } {
  let candidates: StatC[];
  let bubble: string;
  // Watch-only metrics — included when present (a merged/imported session has
  // them; a purely manual log won't, and they're filtered out below).
  const hr = (v?: number) => (v != null ? `${Math.round(v)} bpm` : '—');
  if (isCardio(w.category)) {
    candidates = [
      { label: 'Distance', value: km(w.distance), unit: 'km' },
      { label: 'Time', value: fmtDur(w.duration) },
      { label: 'Pace', value: w.paceLabel || w.pace || '—' },
      { label: 'Kcal', value: kcal(w.calories) },
      { label: 'Avg HR', value: hr(w.avgHr) },
    ];
    bubble = [w.distance ? `${km(w.distance)} km` : null, w.paceLabel || w.pace || (w.duration ? fmtDur(w.duration) : null)]
      .filter(Boolean)
      .join(', ');
  } else if (w.category === 'Strength') {
    const exCount = w.exerciseSets?.length ?? 0;
    const sets = w.exerciseSets?.reduce((n, e) => n + e.sets.length, 0) ?? 0;
    candidates = [
      { label: 'Exercises', value: num(exCount) },
      { label: 'Sets', value: num(sets) },
      { label: 'Duration', value: fmtDur(w.duration) },
      { label: 'Kcal', value: kcal(w.calories) },
      { label: 'Avg HR', value: hr(w.avgHr) },
    ];
    bubble = [exCount ? `${exCount} exercise${exCount === 1 ? '' : 's'}` : null, sets ? `${sets} sets` : null]
      .filter(Boolean)
      .join(', ');
  } else {
    candidates = [
      { label: 'Duration', value: fmtDur(w.duration) },
      { label: 'Kcal', value: kcal(w.calories) },
      { label: 'Avg HR', value: hr(w.avgHr) },
      { label: 'Type', value: w.category },
    ];
    bubble = '';
  }
  // Keep only stats that actually have a value, so the hero is never blank.
  const live = candidates.filter(filled);
  const list = live.length ? live : [{ label: 'Workout', value: w.category } as StatC];
  const [hero, ...rest] = list;
  if (!bubble) bubble = rest[0] ? `${hero.value}, ${rest[0].value}` : hero.value;
  return { hero: { label: hero.label, value: hero.value }, unit: hero.unit ?? '', rest: rest.map((s) => ({ label: s.label, value: s.value })), bubble };
}

export function buildCtx(w: Workout, variant: ShareInk, note = ''): TplCtx {
  const { hero, rest, unit, bubble } = statsFor(w);
  const ink = variant === 'white' ? '#ffffff' : '#1c1917';
  const sub = variant === 'white' ? 'rgba(255,255,255,0.78)' : 'rgba(28,25,23,0.66)';
  const shadow = 'none'; // cards sit on a solid background
  // Time of day comes from the real createdAt; the calendar day can be back-dated
  // via customDate (which carries no time, so don't read a time off it).
  const created = toDate(w.createdAt);
  const dayD = w.customDate ? toDate(`${w.customDate}T12:00:00`) : created;
  const dateStr = fmtDate(w.customDate ?? w.createdAt, 'd MMM yyyy');
  const timeStr = created ? created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const weekday = dayD ? dayD.toLocaleDateString([], { weekday: 'long' }).toUpperCase() : '';
  const Icon = iconForType(w.sport) ?? catMeta(w.category).icon;
  return {
    ink,
    sub,
    shadow,
    hero,
    unit,
    rest,
    cells: [{ label: hero.label, value: unit ? `${hero.value} ${unit}` : hero.value }, ...rest],
    bubble,
    note: note.trim(),
    title: w.title || w.sport || w.category,
    category: w.category,
    dateStr,
    timeStr,
    weekday,
    verb: VERB[w.category] ?? 'Logged',
    icon: <Icon size={44} strokeWidth={2.4} />,
  };
}

export interface ShareTemplate {
  id: string;
  label: string;
  render: (c: TplCtx) => ReactElement;
}

export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'serif-grid',
    label: 'Serif stats',
    render: (c) => (
      <div style={{ padding: 26, width: 'fit-content', color: c.ink, textShadow: c.shadow, fontFamily: SERIF, display: 'flex', justifyContent: 'center', gap: 24 }}>
        {c.cells.map((s) => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 88 }}>
            <p style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.sub }}>{s.label}</p>
            <p style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 28, marginTop: 4 }}>{s.value}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'serif-titled',
    label: 'Serif titled',
    render: (c) => (
      <div style={{ padding: 26, width: 'fit-content', textAlign: 'center', color: c.ink, textShadow: c.shadow, fontFamily: SERIF }}>
        <p style={{ fontSize: 12, letterSpacing: '0.06em', color: c.sub }}>{c.dateStr}{c.timeStr ? ` · ${c.timeStr}` : ''}</p>
        <p style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 40, margin: '6px 0 16px' }}>{c.title}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
          {c.cells.slice(0, 4).map((s) => (
            <div key={s.label}>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.sub }}>{s.label}</p>
              <p style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 22, marginTop: 4 }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'message',
    label: 'Message',
    render: (c) => (
      <div style={{ padding: '18px 20px', width: 250, fontFamily: SANS, textAlign: 'right' }}>
        <div style={{ display: 'inline-block', textAlign: 'left', background: IMSG_BLUE, color: '#fff', borderRadius: '20px 20px 5px 20px', padding: '8px 14px', fontSize: 17, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3, maxWidth: 230 }}>
          {c.bubble}
        </div>
        {/* delivered line → activity type + time, right-aligned & faint like iOS */}
        <p style={{ fontSize: 11, color: c.sub, marginTop: 4, paddingRight: 4 }}>{c.title}, {c.timeStr}</p>
      </div>
    ),
  },
  {
    id: 'bubble-note',
    label: 'iOS note',
    render: (c) => (
      <div style={{ padding: '18px 20px', width: 250, fontFamily: SANS, textAlign: 'right' }}>
        <div style={{ display: 'inline-block', textAlign: 'left', background: IMSG_BLUE, color: '#fff', borderRadius: '20px 20px 5px 20px', padding: '8px 14px', maxWidth: 230 }}>
          <div style={{ fontSize: 17, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{c.bubble}</div>
          {c.note && (
            <div style={{ fontSize: 15, fontWeight: 400, marginTop: 4, lineHeight: 1.32, whiteSpace: 'pre-wrap' }}>{c.note}</div>
          )}
        </div>
        <p style={{ fontSize: 11, color: c.sub, marginTop: 4, paddingRight: 4 }}>{c.title}, {c.timeStr}</p>
      </div>
    ),
  },
];
