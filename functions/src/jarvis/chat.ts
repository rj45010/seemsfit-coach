import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAllowedUser } from '../shared/allowlist.js';
import { chatsCol } from '../shared/firestoreAdmin.js';
import { getProvider } from './provider.js';
import { buildContext, contextToText, hashContext } from './context.js';
import { CHAT_SYSTEM } from './prompts.js';
import { extractProposals } from './actions.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const REGION = 'asia-south1';

/** POST /jarvisChat  body: { threadId?, message } — streams SSE. */
export const jarvisChat = onRequest(
  { region: REGION, secrets: [GEMINI_API_KEY], cors: true },
  async (req, res) => {
    let uid: string;
    try {
      const decoded = await requireAllowedUser(req);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const { threadId: incoming, message } = (req.body ?? {}) as {
      threadId?: string;
      message?: string;
    };
    if (!message?.trim()) {
      res.status(400).json({ error: 'empty_message' });
      return;
    }

    // Resolve / create thread.
    let threadId = incoming;
    if (!threadId) {
      const ref = await chatsCol(uid).add({
        title: message.slice(0, 48),
        createdAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
      });
      threadId = ref.id;
    }
    const messages = chatsCol(uid).doc(threadId).collection('messages');
    await messages.add({ role: 'user', content: message, createdAt: FieldValue.serverTimestamp() });

    const ctx = await buildContext(uid);
    const ctxHash = hashContext(ctx);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let full = '';
    try {
      const provider = await getProvider();
      const stream = provider.streamText({
        system: CHAT_SYSTEM,
        parts: [{ text: contextToText(ctx) }, { text: `\n\nUser: ${message}` }],
      });
      for await (const chunk of stream) {
        full += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (e) {
      logger.error('jarvisChat stream failed', e);
      res.write(`data: ${JSON.stringify({ error: 'generation_failed' })}\n\n`);
    }

    // Separate prose from proposed actions; persist only the prose.
    const { reply, proposals } = extractProposals(full);
    await messages.add({
      role: 'jarvis',
      content: reply,
      contextHash: ctxHash,
      ...(proposals.length ? { proposals } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    await chatsCol(uid).doc(threadId).set({ lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });

    res.write(`data: ${JSON.stringify({ done: true, threadId, proposals })}\n\n`);
    res.end();
  },
);
