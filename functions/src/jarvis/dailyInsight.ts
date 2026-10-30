import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { insightDoc } from '../shared/firestoreAdmin.js';
import { getProvider } from './provider.js';
import { buildContext, contextToText, hashContext } from './context.js';
import { INSIGHT_SYSTEM } from './prompts.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-south1';

const InsightSchema = z.object({
  headline: z.string(),
  body: z.string(),
  recommendations: z.array(z.string()).default([]),
});

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Runs every 4.2h (252 min) so the insight refreshes through the day as new data
 *  arrives. Idempotent via inputsHash — an unchanged run skips the AI call (no cost).
 *  OWNER_UID env. */
export const dailyInsight = onSchedule(
  { region: REGION, schedule: 'every 252 minutes', timeZone: 'Asia/Kolkata', secrets: [GEMINI_API_KEY] },
  async () => {
    const uid = process.env.OWNER_UID;
    if (!uid) {
      logger.error('dailyInsight: OWNER_UID not set');
      return;
    }
    const date = todayKey();
    const ref = insightDoc(uid, date);

    const ctx = await buildContext(uid);
    const inputsHash = hashContext(ctx);

    const existing = await ref.get();
    if (existing.exists && existing.data()!.inputsHash === inputsHash) {
      logger.info('dailyInsight: unchanged inputs, skipping');
      return;
    }

    try {
      const provider = await getProvider();
      const raw = await provider.generateText({
        system: INSIGHT_SYSTEM,
        json: true,
        temperature: 0.6,
        parts: [{ text: contextToText(ctx) }],
      });
      const insight = InsightSchema.parse(JSON.parse(raw));
      await ref.set({
        date,
        ...insight,
        inputsHash,
        generatedAt: FieldValue.serverTimestamp(),
      });
      logger.info('dailyInsight: wrote', date);
    } catch (e) {
      logger.error('dailyInsight failed', e);
    }
  },
);
