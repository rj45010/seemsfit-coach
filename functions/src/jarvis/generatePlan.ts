import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAllowedUser } from '../shared/allowlist.js';
import { db, plansCol } from '../shared/firestoreAdmin.js';
import { getProvider } from './provider.js';
import { buildContext, contextToText } from './context.js';
import { planSystem } from './prompts.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-south1';

const ExerciseSchema = z.object({
  name: z.string(),
  exName: z.string().optional(),
  sets: z.number(),
  reps: z.union([z.number(), z.string()]),
  done: z.boolean().default(false),
  supersetId: z.string().nullable().default(null),
  loggedSets: z.array(z.unknown()).default([]),
});
const SessionSchema = z.object({
  day: z.string(),
  category: z.string(),
  duration: z.number(),
  title: z.string(),
  calories: z.number().optional(),
  exercises: z.array(ExerciseSchema),
});
const PlanSchema = z.object({
  title: z.string(),
  sourceId: z.string(),
  weeks: z.array(z.object({ weekNumber: z.number(), sessions: z.array(SessionSchema) })),
});

/** POST /jarvisPlan  body: { goalId, weeks } — writes one plan doc per session. */
export const jarvisPlan = onRequest(
  { region: REGION, secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    let uid: string;
    try {
      uid = (await requireAllowedUser(req)).uid;
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const { goalId, weeks = 4 } = (req.body ?? {}) as { goalId?: string; weeks?: number };

    let goalText = 'general fitness';
    if (goalId) {
      const g = await db.doc(`users/${uid}/goals/${goalId}`).get();
      if (g.exists) {
        const d = g.data()!;
        goalText = `"${d.title}" (${d.metric}: current ${d.current} ${d.unit}, target ${d.target} ${d.unit} by ${d.targetDate})`;
      }
    }

    try {
      const ctx = await buildContext(uid);
      const provider = await getProvider();
      const raw = await provider.generateText({
        system: planSystem(weeks),
        json: true,
        temperature: 0.4,
        parts: [{ text: contextToText(ctx) }, { text: `\n\nGoal: ${goalText}` }],
      });
      const plan = PlanSchema.parse(JSON.parse(raw));

      // Flatten weeks/sessions into individual plan docs sharing sourceId.
      const sourceId = `${plan.sourceId}-${Date.now()}`;
      const batch = db.batch();
      let count = 0;
      for (const wk of plan.weeks) {
        for (const s of wk.sessions) {
          const ref = plansCol(uid).doc();
          batch.set(ref, {
            title: `${plan.title} · W${wk.weekNumber} ${s.title}`,
            day: s.day,
            category: s.category,
            duration: s.duration,
            calories: s.calories ?? null,
            exercises: s.exercises,
            sourceId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          count++;
        }
      }
      await batch.commit();
      res.json({ ok: true, sourceId, sessions: count });
    } catch (e) {
      logger.error('jarvisPlan failed', e);
      res.status(500).json({ error: 'plan_failed' });
    }
  },
);
