import { unzipSync, strFromU8 } from 'fflate';
import { collection, doc, getDocs, setDoc, Timestamp, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Client-side Health Auto Export importer. Unzips a HAE export in the browser,
 * parses the daily-metrics CSV + workouts CSV (+ downsampled routes), and writes
 * to Firestore idempotently (date-keyed days, deterministic workout IDs, merge).
 * Designed for the user uploading a chosen date range from the iPhone.
 */

export interface HaeResult {
  days: number;
  workouts: number;
  routes: number;
  skipped: number;
  merged: number;
}

const KJ_TO_KCAL = 1 / 4.184;
const OVERLAP_MS = 45 * 60 * 1000;

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') q = true;
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  if (!lines.length) return { header: [], rows: [] };
  return { header: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

const numOrU = (v: string | undefined): number | undefined => {
  if (v == null || v.trim() === '') return undefined;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : undefined;
};

const CATEGORY: Record<string, string> = {
  'Traditional Strength Training': 'Strength',
  'Functional Strength Training': 'Strength',
  'Core Training': 'Core',
  'Outdoor Run': 'Running',
  'Indoor Run': 'Running',
  'Outdoor Walk': 'Walking',
  'Indoor Walk': 'Walking',
  'Outdoor Cycling': 'Cycling',
  'Indoor Cycling': 'Cycling',
  'Pool Swim': 'Swimming',
  'Open Water Swim': 'Swimming',
  'High Intensity Interval Training': 'HIIT',
  Hiking: 'Hiking',
  Yoga: 'Yoga',
};
const CARDIO = new Set(['Running', 'Walking', 'Cycling', 'Hiking']);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const compactStamp = (start: string) =>
  `${start.slice(0, 10).replace(/-/g, '')}_${start.slice(11, 19).replace(/:/g, '') || '000000'}`;
const durationToMin = (d: string): number | undefined => {
  const m = d.match(/(\d+):(\d+):(\d+)/);
  return m ? Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3]) / 60) : undefined;
};
const paceLabel = (durMin?: number, distKm?: number): string | undefined => {
  if (!durMin || !distKm) return undefined;
  const sec = (durMin * 60) / distKm;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km`;
};

function parseGpx(text: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const re = /<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  return pts;
}
function downsample(pts: Array<[number, number]>, max = 200): Array<[number, number]> {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

const drop = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function importHaeZip(file: File, uid: string): Promise<HaeResult> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(files);
  const text = (n: string) => strFromU8(files[n]);
  const base = `users/${uid}`;

  let maxDate = '0000-00-00';
  const COMMIT = 400;
  const result: HaeResult = { days: 0, workouts: 0, routes: 0, skipped: 0, merged: 0 };

  // ---- daily ----
  const dailyFile = names.find((f) => /HealthAutoExport-.*\.csv$/.test(f));
  if (dailyFile) {
    const { header, rows } = parseCsv(text(dailyFile));
    const idx = new Map(header.map((h, i) => [h, i]));
    const c = (row: string[], name: string) => { const i = idx.get(name); return i == null ? undefined : row[i]; };
    let batch = writeBatch(db);
    let n = 0;
    for (const row of rows) {
      const dt = c(row, 'Date/Time');
      if (!dt) continue;
      const date = dt.slice(0, 10);
      const kj = numOrU(c(row, 'Active Energy (kJ)'));
      const sleepHr = numOrU(c(row, 'Sleep Analysis [Total] (hr)')) ?? numOrU(c(row, 'Sleep Analysis [Asleep] (hr)'));
      const stage = (nm: string) => { const v = numOrU(c(row, nm)); return v != null ? Math.round(v * 60) : undefined; };
      const docData = drop({
        date, source: 'hae',
        activeEnergyKcal: kj != null ? Math.round(kj * KJ_TO_KCAL) : undefined,
        exerciseMin: numOrU(c(row, 'Apple Exercise Time (min)')),
        standHours: numOrU(c(row, 'Apple Stand Hour (hr)')),
        steps: numOrU(c(row, 'Step Count (steps)')),
        distanceKm: numOrU(c(row, 'Walking + Running Distance (km)')),
        flightsClimbed: numOrU(c(row, 'Flights Climbed (count)')),
        restingHr: numOrU(c(row, 'Resting Heart Rate (bpm)')),
        walkingHrAvg: numOrU(c(row, 'Walking Heart Rate Average (bpm)')),
        vo2Max: numOrU(c(row, 'VO2 Max (ml/(kg·min))')),
        respiratoryRate: numOrU(c(row, 'Respiratory Rate (count/min)')),
        spo2: numOrU(c(row, 'Blood Oxygen Saturation (%)')),
        wristTempC: numOrU(c(row, 'Apple Sleeping Wrist Temperature (ºC)')) ?? numOrU(c(row, 'Apple Sleeping Wrist Temperature (°C)')),
        bodyFatPct: numOrU(c(row, 'Body Fat Percentage (%)')),
        weightKg: numOrU(c(row, 'Weight (kg)')),
        mindfulMin: numOrU(c(row, 'Mindful Minutes (min)')),
      }) as Record<string, unknown>;
      const hrv = numOrU(c(row, 'Heart Rate Variability (ms)'));
      if (hrv != null) docData.hrv = { avg: hrv };
      if (sleepHr != null) {
        // Bed-time / wake-time when the export carries them (column names vary by HAE version).
        const sleepStart = (c(row, 'Sleep Analysis [Start]') || c(row, 'Sleep Analysis [In Bed Start]') || '').trim() || undefined;
        const sleepEnd = (c(row, 'Sleep Analysis [End]') || c(row, 'Sleep Analysis [In Bed End]') || '').trim() || undefined;
        docData.sleep = drop({
          totalMin: Math.round(sleepHr * 60),
          start: sleepStart,
          end: sleepEnd,
          stages: drop({ deep: stage('Sleep Analysis [Deep] (hr)'), rem: stage('Sleep Analysis [REM] (hr)'), core: stage('Sleep Analysis [Core] (hr)'), awake: stage('Sleep Analysis [Awake] (hr)') }),
        });
      }
      docData.updatedAt = Timestamp.now();
      batch.set(doc(db, `${base}/dailyMetrics/${date}`), docData, { merge: true });
      result.days++;
      if (date > maxDate) maxDate = date;
      if (++n % COMMIT === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    if (n % COMMIT !== 0) await batch.commit();
  }

  // ---- existing manual workouts (for merge) ----
  // When an Apple workout overlaps a manual log of the SAME category, we MERGE the
  // watch's metrics (calories/HR/duration) into that manual log rather than create
  // a duplicate — keeping the user's sets/reps/supersets. Prefer the real createdAt
  // time; fall back to the date (noon) when that's all we have.
  const existing = await getDocs(collection(db, `${base}/workouts`));
  const manual: Array<{ ms: number; date: string; cat: string; ref: DocumentReference; data: Record<string, unknown>; used?: boolean }> = [];
  for (const d of existing.docs) {
    const w = d.data() as { source?: string; category?: string; customDate?: string; createdAt?: { toMillis?: () => number } };
    if (w.source === 'hae') continue;
    const ms = w.createdAt?.toMillis?.() ?? (w.customDate ? Date.parse(`${w.customDate}T12:00:00`) : NaN);
    if (!Number.isFinite(ms)) continue;
    const date = w.customDate || new Date(ms).toISOString().slice(0, 10);
    manual.push({ ms, date, cat: w.category || 'Other', ref: d.ref, data: w as Record<string, unknown> });
  }
  // Match a watch workout to a manual log: SAME DATE + SAME CATEGORY is the primary
  // signal (a strength session you logged the same day as a watch strength session
  // is the same session), picking the closest in time if there are several. Time
  // proximity still applies as a fallback so undated edge cases keep working. Each
  // manual log is consumed once so two watch workouts can't both fold into it.
  const findMatch = (ms: number, cat: string, date: string) => {
    const sameDay = manual.filter((m) => !m.used && m.cat === cat && m.date === date);
    if (sameDay.length) return sameDay.sort((a, b) => Math.abs(a.ms - ms) - Math.abs(b.ms - ms))[0];
    return manual.find((m) => !m.used && m.cat === cat && Math.abs(m.ms - ms) < OVERLAP_MS);
  };

  // ---- workouts ----
  const woFile = names.find((f) => /Workouts-.*\.csv$/.test(f));
  if (woFile) {
    const { header, rows } = parseCsv(text(woFile));
    const idx = new Map(header.map((h, i) => [h, i]));
    const c = (row: string[], name: string) => { const i = idx.get(name); return i == null ? undefined : row[i]; };
    const routeIdx = names
      .map((f) => {
        const m = f.match(/^(.*)-Route-(\d{8})_(\d{6})\.gpx$/);
        if (!m) return null;
        const [, type, d, t] = m;
        const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
        return { type, ms: Date.parse(iso), file: f };
      })
      .filter((r): r is { type: string; ms: number; file: string } => r !== null);

    let batch = writeBatch(db);
    let n = 0;
    for (const row of rows) {
      const type = (c(row, 'Workout Type') || '').trim();
      const start = (c(row, 'Start') || '').trim();
      if (!type || !start) continue;
      const startMs = Date.parse(start.replace(' ', 'T'));
      const category = CATEGORY[type] ?? 'Other';
      const date = start.slice(0, 10);
      const durationMin = durationToMin(c(row, 'Duration') || '');
      const distanceKm = numOrU(c(row, 'Distance (km)'));
      const kj = numOrU(c(row, 'Active Energy (kJ)'));

      // Same-category manual log nearby → enrich it with the watch's metrics
      // (only fields it's missing) instead of importing a duplicate.
      const match = findMatch(startMs, category, date);
      if (match) {
        match.used = true;
        const watch = drop({
          duration: durationMin,
          calories: kj != null ? Math.round(kj * KJ_TO_KCAL) : undefined,
          avgHr: numOrU(c(row, 'Avg. Heart Rate (bpm)')),
          maxHr: numOrU(c(row, 'Max. Heart Rate (bpm)')),
        });
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(watch)) if (match.data[k] == null) patch[k] = v;
        if (Object.keys(patch).length) {
          patch.updatedAt = Timestamp.now();
          batch.set(match.ref, patch, { merge: true });
          if (++n % COMMIT === 0) { await batch.commit(); batch = writeBatch(db); }
        }
        result.merged++;
        continue;
      }

      const id = `hae_${slug(type)}_${compactStamp(start)}`;
      const docData = drop({
        title: type, sport: type, category, source: 'hae', isManual: false,
        customDate: date, createdAt: Timestamp.fromDate(new Date(start.replace(' ', 'T'))),
        duration: durationMin, distance: distanceKm,
        calories: kj != null ? Math.round(kj * KJ_TO_KCAL) : undefined,
        avgHr: numOrU(c(row, 'Avg. Heart Rate (bpm)')),
        maxHr: numOrU(c(row, 'Max. Heart Rate (bpm)')),
        paceLabel: CARDIO.has(category) ? paceLabel(durationMin, distanceKm) : undefined,
      }) as Record<string, unknown>;
      const route = routeIdx.find((r) => r.type === type && Math.abs(r.ms - startMs) < 90_000);
      if (route) {
        const pts = downsample(parseGpx(text(route.file)));
        if (pts.length > 1) { docData.route = pts.map(([lat, lng]) => ({ lat, lng })); result.routes++; }
      }
      docData.updatedAt = Timestamp.now();
      batch.set(doc(db, `${base}/workouts/${id}`), docData, { merge: true });
      result.workouts++;
      if (date > maxDate) maxDate = date;
      if (++n % COMMIT === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    if (n % COMMIT !== 0) await batch.commit();
  }

  await setDoc(doc(db, `${base}/meta/haeSync`), { lastDate: maxDate, lastRunAt: Timestamp.now() }, { merge: true });
  return result;
}
