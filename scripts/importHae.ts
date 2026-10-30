/**
 * Idempotent importer for Health Auto Export (HAE) CSV/GPX bulk dumps.
 *
 * Each HAE export is a FULL dump. This script is safe to re-run nightly: it uses
 * date-keyed daily docs and deterministic workout IDs + merge writes, so nothing
 * duplicates. A watermark (meta/haeSync) means the first run backfills everything
 * and later runs only touch recent days.
 *
 * Scope (per ROADMAP / agreed): daily metrics + workout summaries + downsampled
 * route polylines into Firestore. Per-second HR/energy series are skipped.
 *
 * Run:
 *   npx tsx scripts/importHae.ts /path/to/HealthAutoExport_xxx.zip
 *   # or: HAE_ZIP=/path/to.zip npx tsx scripts/importHae.ts
 *   # or point at an already-extracted folder: HAE_DIR=/path/to/folder
 *
 * Requires (gitignored): scripts/service-accounts/service-account.json
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KJ_TO_KCAL = 1 / 4.184;
const OVERLAP_MS = 45 * 60 * 1000; // manual log wins within ±45 min

// ---------- CSV parsing ----------
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
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
const dropU = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ---------- workout type → app category ----------
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
  `${start.slice(0, 10).replace(/-/g, '')}_${start.slice(11, 19).replace(/:/g, '')}`;
const durationToMin = (d: string): number | undefined => {
  const m = d.match(/(\d+):(\d+):(\d+)/);
  if (!m) return undefined;
  return Math.round((+m[1] * 3600 + +m[2] * 60 + +m[3]) / 60);
};
const paceLabel = (durMin?: number, distKm?: number): string | undefined => {
  if (!durMin || !distKm) return undefined;
  const sec = (durMin * 60) / distKm;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km`;
};

// ---------- GPX route ----------
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

async function main() {
  // --- resolve source folder ---
  const zip = process.env.HAE_ZIP || process.argv[2];
  let dir = process.env.HAE_DIR;
  if (!dir) {
    if (!zip) {
      console.error('Pass the HAE zip path (arg or HAE_ZIP), or set HAE_DIR to an extracted folder.');
      process.exit(1);
    }
    dir = mkdtempSync(join(tmpdir(), 'hae-'));
    console.log(`Extracting ${zip} …`);
    execSync(`unzip -o "${zip}" -d "${dir}"`, { stdio: 'ignore' });
  }
  const files = readdirSync(dir);

  // --- firebase admin ---
  const sa = JSON.parse(readFileSync(resolve(__dirname, 'service-accounts', 'service-account.json'), 'utf8'));
  initializeApp({ credential: cert(sa) });
  const db: Firestore = getFirestore();
  const email = process.env.EMAIL ?? '';
  if (!process.env.UID && !email) throw new Error('Set EMAIL or UID');
  const uid = process.env.UID || (await getAuth().getUserByEmail(email)).uid;
  const base = `users/${uid}`;
  console.log(`Importing for uid ${uid}\n`);

  // --- watermark (delta on nightly runs) ---
  const metaRef = db.doc(`${base}/meta/haeSync`);
  const meta = (await metaRef.get()).data() as { lastDate?: string } | undefined;
  let cutoff = '0000-00-00';
  if (meta?.lastDate && process.env.FULL !== '1') {
    const d = new Date(meta.lastDate);
    d.setDate(d.getDate() - 3); // re-touch last 3 days (late HR backfill / edits)
    cutoff = d.toISOString().slice(0, 10);
  }
  console.log(`Cutoff date: ${cutoff === '0000-00-00' ? '(full backfill)' : cutoff}`);

  let maxDate = meta?.lastDate ?? '0000-00-00';
  const commitEvery = 400;

  // ---------- 1) DAILY METRICS ----------
  const dailyFile = files.find((f) => /^HealthAutoExport-.*\.csv$/.test(f));
  let dailyCount = 0;
  if (dailyFile) {
    const { header, rows } = parseCsv(readFileSync(join(dir, dailyFile), 'utf8'));
    const idx = new Map(header.map((h, i) => [h, i]));
    const col = (row: string[], name: string) => {
      const i = idx.get(name);
      return i == null ? undefined : row[i];
    };
    let batch = db.batch();
    let n = 0;
    for (const row of rows) {
      const dt = col(row, 'Date/Time');
      if (!dt) continue;
      const date = dt.slice(0, 10);
      if (date < cutoff) continue;
      const kj = numOrU(col(row, 'Active Energy (kJ)'));
      const sleepTotalHr = numOrU(col(row, 'Sleep Analysis [Total] (hr)')) ?? numOrU(col(row, 'Sleep Analysis [Asleep] (hr)'));
      const stage = (n2: string) => {
        const v = numOrU(col(row, n2));
        return v != null ? Math.round(v * 60) : undefined;
      };
      const doc = dropU({
        date,
        source: 'hae',
        activeEnergyKcal: kj != null ? Math.round(kj * KJ_TO_KCAL) : undefined,
        exerciseMin: numOrU(col(row, 'Apple Exercise Time (min)')),
        standHours: numOrU(col(row, 'Apple Stand Hour (hr)')),
        steps: numOrU(col(row, 'Step Count (steps)')),
        distanceKm: numOrU(col(row, 'Walking + Running Distance (km)')),
        flightsClimbed: numOrU(col(row, 'Flights Climbed (count)')),
        restingHr: numOrU(col(row, 'Resting Heart Rate (bpm)')),
        walkingHrAvg: numOrU(col(row, 'Walking Heart Rate Average (bpm)')),
        vo2Max: numOrU(col(row, 'VO2 Max (ml/(kg·min))')),
        respiratoryRate: numOrU(col(row, 'Respiratory Rate (count/min)')),
        spo2: numOrU(col(row, 'Blood Oxygen Saturation (%)')),
        bodyFatPct: numOrU(col(row, 'Body Fat Percentage (%)')),
        weightKg: numOrU(col(row, 'Weight (kg)')),
        mindfulMin: numOrU(col(row, 'Mindful Minutes (min)')),
      }) as Record<string, unknown>;
      const hrv = numOrU(col(row, 'Heart Rate Variability (ms)'));
      if (hrv != null) doc.hrv = { avg: hrv };
      if (sleepTotalHr != null) {
        doc.sleep = dropU({
          totalMin: Math.round(sleepTotalHr * 60),
          stages: dropU({
            deep: stage('Sleep Analysis [Deep] (hr)'),
            rem: stage('Sleep Analysis [REM] (hr)'),
            core: stage('Sleep Analysis [Core] (hr)'),
            awake: stage('Sleep Analysis [Awake] (hr)'),
          }),
        });
      }
      doc.updatedAt = Timestamp.now();
      batch.set(db.doc(`${base}/dailyMetrics/${date}`), doc, { merge: true });
      dailyCount++;
      if (date > maxDate) maxDate = date;
      if (++n % commitEvery === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % commitEvery !== 0) await batch.commit();
  }
  console.log(`  dailyMetrics written/merged: ${dailyCount}`);

  // ---------- existing manual workouts (for dedup) ----------
  const existing = await db.collection(`${base}/workouts`).get();
  const manualTimes: number[] = [];
  for (const d of existing.docs) {
    const w = d.data();
    if (w.source === 'hae') continue; // only dedup against non-HAE (manual/migrated)
    const t = w.customDate ? Date.parse(w.customDate) : w.createdAt?.toMillis?.();
    if (Number.isFinite(t)) manualTimes.push(t as number);
  }
  const overlapsManual = (ms: number) => manualTimes.some((t) => Math.abs(t - ms) < OVERLAP_MS);

  // ---------- 2) WORKOUTS ----------
  const woFile = files.find((f) => /^Workouts-.*\.csv$/.test(f));
  let woCount = 0;
  let woSkipped = 0;
  let routeCount = 0;
  if (woFile) {
    const { header, rows } = parseCsv(readFileSync(join(dir, woFile), 'utf8'));
    const idx = new Map(header.map((h, i) => [h, i]));
    const col = (row: string[], name: string) => {
      const i = idx.get(name);
      return i == null ? undefined : row[i];
    };

    // Index route files: HAE workout Start is minute-precision but route files carry
    // seconds, so match by type + nearest start within 90s rather than exact filename.
    const routeIdx = files
      .map((f) => {
        const m = f.match(/^(.*)-Route-(\d{8})_(\d{6})\.gpx$/);
        if (!m) return null;
        const [, type, d, t] = m;
        const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
        return { type, ms: Date.parse(iso), file: f };
      })
      .filter((r): r is { type: string; ms: number; file: string } => r !== null);

    let batch = db.batch();
    let n = 0;
    for (const row of rows) {
      const type = (col(row, 'Workout Type') || '').trim();
      const start = (col(row, 'Start') || '').trim();
      if (!type || !start) continue;
      const date = start.slice(0, 10);
      if (date < cutoff) continue;

      const startMs = Date.parse(start.replace(' ', 'T'));
      if (overlapsManual(startMs)) { woSkipped++; continue; } // your manual log wins

      const category = CATEGORY[type] ?? 'Other';
      const durationMin = durationToMin(col(row, 'Duration') || '');
      const distanceKm = numOrU(col(row, 'Distance (km)'));
      const kj = numOrU(col(row, 'Active Energy (kJ)'));
      const id = `hae_${slug(type)}_${compactStamp(start)}`;

      const doc = dropU({
        title: type,
        sport: type,
        category,
        source: 'hae',
        isManual: false,
        customDate: date,
        createdAt: Timestamp.fromDate(new Date(start.replace(' ', 'T'))),
        duration: durationMin,
        distance: distanceKm,
        calories: kj != null ? Math.round(kj * KJ_TO_KCAL) : undefined,
        avgHr: numOrU(col(row, 'Avg. Heart Rate (bpm)')),
        maxHr: numOrU(col(row, 'Max. Heart Rate (bpm)')),
        paceLabel: CARDIO.has(category) ? paceLabel(durationMin, distanceKm) : undefined,
      }) as Record<string, unknown>;

      // matching downsampled route (type + start within 90s), if present
      const route = routeIdx.find((r) => r.type === type && Math.abs(r.ms - startMs) < 90_000);
      if (route) {
        const pts = downsample(parseGpx(readFileSync(join(dir, route.file), 'utf8')));
        // Firestore disallows nested arrays → store as [{lat,lng}, …].
        if (pts.length > 1) { doc.route = pts.map(([lat, lng]) => ({ lat, lng })); routeCount++; }
      }
      doc.updatedAt = Timestamp.now();
      batch.set(db.doc(`${base}/workouts/${id}`), doc, { merge: true });
      woCount++;
      if (date > maxDate) maxDate = date;
      if (++n % commitEvery === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % commitEvery !== 0) await batch.commit();
  }
  console.log(`  workouts written/merged: ${woCount} (with routes: ${routeCount}, skipped as manual-overlap: ${woSkipped})`);

  // ---------- watermark ----------
  await metaRef.set({ lastDate: maxDate, lastRunAt: Timestamp.now() }, { merge: true });
  console.log(`\nWatermark set to ${maxDate}. Done.`);
}

main().catch((e) => {
  console.error('IMPORT FAILED:', e);
  process.exit(1);
});
