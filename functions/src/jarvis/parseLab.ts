import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { requireAllowedUser } from '../shared/allowlist.js';
import { labDoc, storage } from '../shared/firestoreAdmin.js';
import { getProvider } from './provider.js';
import { LAB_SYSTEM } from './prompts.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-south1';

const MarkerSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  refLow: z.number().nullable().optional(),
  refHigh: z.number().nullable().optional(),
  flag: z.enum(['normal', 'low', 'high', 'critical']),
});
const LabSchema = z.object({
  reportDate: z.string(),
  lab: z.string().optional(),
  markers: z.array(MarkerSchema),
  jarvisSummary: z.string(),
  rawText: z.string().optional(),
});

/** POST /jarvisParseLab  body: { labId } */
export const jarvisParseLab = onRequest(
  { region: REGION, secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    let uid: string;
    try {
      uid = (await requireAllowedUser(req)).uid;
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const { labId } = (req.body ?? {}) as { labId?: string };
    if (!labId) {
      res.status(400).json({ error: 'missing_labId' });
      return;
    }

    const ref = labDoc(uid, labId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'lab_not_found' });
      return;
    }
    const pdfPath = snap.data()!.pdfStoragePath as string;

    try {
      const [buf] = await storage.bucket().file(pdfPath).download();
      const provider = await getProvider();
      const raw = await provider.generateText({
        system: LAB_SYSTEM,
        json: true,
        temperature: 0.1,
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: buf.toString('base64') } },
          { text: 'Extract all markers as specified.' },
        ],
      });

      const parsed = LabSchema.parse(JSON.parse(raw));
      await ref.set(
        {
          status: 'parsed',
          reportDate: parsed.reportDate,
          lab: parsed.lab ?? '',
          markers: parsed.markers,
          jarvisSummary: parsed.jarvisSummary,
          rawText: parsed.rawText ?? '',
          parseError: null,
        },
        { merge: true },
      );
      res.json({ ok: true, markers: parsed.markers.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'parse_failed';
      logger.error('jarvisParseLab failed', e);
      await ref.set({ status: 'failed', parseError: msg }, { merge: true });
      res.status(500).json({ error: 'parse_failed', detail: msg });
    }
  },
);
