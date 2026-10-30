import { z } from 'zod';

/**
 * Structured changes Jarvis can PROPOSE to the user's training/goals.
 * Jarvis never writes directly — these are validated server-side, sent to the
 * client, and applied only when the user taps "Apply" (client-side, under his auth).
 */

const PlanExerciseInput = z.object({
  name: z.string(),
  exName: z.string().optional(),
  sets: z.number(),
  reps: z.union([z.number(), z.string()]),
  supersetId: z.string().nullable().default(null),
});

const PlanInput = z.object({
  title: z.string(),
  day: z.string(),
  category: z.string(),
  duration: z.number(),
  calories: z.number().optional(),
  exercises: z.array(PlanExerciseInput).default([]),
});

export const ActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('createProgram'),
    title: z.string(),
    goalType: z.string().optional(),
    plans: z.array(PlanInput),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal('updatePlan'),
    planId: z.string(),
    patch: z.object({
      title: z.string().optional(),
      day: z.string().optional(),
      category: z.string().optional(),
      duration: z.number().optional(),
      exercises: z.array(PlanExerciseInput).optional(),
    }),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal('archiveProgram'),
    sourceId: z.string(),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal('createGoal'),
    goal: z.object({
      title: z.string(),
      category: z.enum(['cardio', 'strength', 'body', 'bloodMarker', 'habit']),
      metric: z.string(),
      target: z.number(),
      current: z.number().optional(),
      unit: z.string(),
      targetDate: z.string().optional(),
    }),
    summary: z.string(),
  }),
]);

export type ProposedAction = z.infer<typeof ActionSchema>;

export const PROPOSAL_SENTINEL = '===PROPOSALS===';

/** Split a Jarvis reply into prose + validated proposals. */
export function extractProposals(text: string): { reply: string; proposals: ProposedAction[] } {
  const idx = text.indexOf(PROPOSAL_SENTINEL);
  if (idx === -1) return { reply: text.trim(), proposals: [] };

  const reply = text.slice(0, idx).trim();
  const json = text.slice(idx + PROPOSAL_SENTINEL.length).trim();
  try {
    const arr = JSON.parse(json);
    const proposals = z.array(ActionSchema).parse(Array.isArray(arr) ? arr : [arr]);
    return { reply, proposals };
  } catch {
    return { reply, proposals: [] };
  }
}
