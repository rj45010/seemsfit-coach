import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { checkIngestSecret } from '../shared/allowlist.js';
import { shortcutAdapter } from './adapters/shortcut.js';
import { haeAdapter } from './adapters/healthAutoExport.js';
import { writeDaily } from './writeDaily.js';
import { writeWorkout } from './writeWorkout.js';
import type { Adapter } from './adapters/types.js';

const INGEST_SECRET = defineSecret('INGEST_SECRET');

const REGION = 'asia-south1';

/**
 * Apple Health ingest webhook. Routes:
 *   POST /shortcut          -> shortcut adapter, daily metrics
 *   POST /shortcut/workout  -> shortcut adapter, workout
 *   POST /hae               -> Health Auto Export adapter, daily metrics
 *   POST /hae/workout       -> HAE adapter, workout
 * Auth: X-Helios-Secret header. Writes under OWNER_UID (env).
 */
export const ingest = onRequest(
  { region: REGION, secrets: [INGEST_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!checkIngestSecret(req)) {
      res.status(401).json({ error: 'bad_secret' });
      return;
    }
    const uid = process.env.OWNER_UID;
    if (!uid) {
      res.status(500).json({ error: 'OWNER_UID not set' });
      return;
    }

    // Path after the function name, e.g. "/shortcut/workout".
    const path = req.path.replace(/^\/+/, '');
    const [source, kind] = path.split('/');
    const adapter: Adapter | null =
      source === 'shortcut' ? shortcutAdapter : source === 'hae' ? haeAdapter : null;
    if (!adapter) {
      res.status(404).json({ error: 'unknown_source', path });
      return;
    }

    try {
      if (kind === 'workout') {
        const w = adapter.normalizeWorkout?.(req.body);
        if (!w) {
          res.status(422).json({ error: 'unparseable_workout' });
          return;
        }
        const wrote = await writeWorkout(uid, w);
        res.json({ ok: true, wrote });
        return;
      }

      const daily = adapter.normalizeDaily(req.body);
      if (!daily) {
        res.status(422).json({ error: 'unparseable_daily' });
        return;
      }
      const wrote = await writeDaily(uid, daily);
      res.json({ ok: true, wrote });
    } catch (e) {
      logger.error('ingest failed', e);
      res.status(500).json({ error: 'write_failed' });
    }
  },
);
