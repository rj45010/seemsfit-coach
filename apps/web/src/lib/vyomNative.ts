import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  addDoc, arrayRemove, collection, doc, getDoc, getDocs, limit as fbLimit, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { applyAction, type ProposedAction } from './jarvisActions';
import { importHaeZip } from './haeImport';
import { getTheme, subscribeTheme } from './theme';
import { streamChat } from './jarvisClient';

/** Ask the model for a concise 3–6 word title for a new chat (falls back to '' on any failure). */
async function aiThreadTitle(firstMessage: string): Promise<string> {
  const system =
    "Generate a concise title for a health & fitness chat. Reply with ONLY a 3–6 word title in Title Case that summarises the user's message. No quotes, no trailing punctuation, no preamble.";
  let out = '';
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    streamChat(system, firstMessage, [], [], { onChunk: (t) => { out += t; }, onDone: finish, onError: finish })
      .then(finish)
      .catch(finish);
  });
  const title = out.split('\n')[0].trim().replace(/^["'`*]+|["'`*]+$/g, '').replace(/[.!?,;:]+$/, '').trim();
  return title.length > 48 ? title.slice(0, 48).trim() : title;
}

/**
 * Bridge to the native SwiftUI Vyom chat (iOS). The native screen owns UI + streaming + a
 * keyboard glued to the input; ALL business logic stays here (single source of truth): proposals
 * apply via applyAction (with the real result sent back), and messages/threads persist to the same
 * Firestore docs as the web chat. It also loads and continues your last conversation.
 */
interface InitialMsg { role: string; content: string; provider?: string; attachmentKind?: string }

interface VyomChatPlugin {
  open(o: { system: string; jarvisUrl: string; seed?: string; autoSend?: boolean; initialMessages?: InitialMsg[]; theme?: string }): Promise<void>;
  setContext(o: { system: string; initialMessages: InitialMsg[] }): Promise<void>;
  setTheme(o: { theme: string }): Promise<void>;
  applyResult(o: { id: string; ok: boolean }): Promise<void>;
  pushMessage(o: { role: 'user' | 'jarvis'; content: string }): Promise<void>;
  setMemory(o: { instructions: string; facts: string[] }): Promise<void>;
  setThreads(o: { threads: { id: string; title: string; subtitle: string }[]; activeId?: string }): Promise<void>;
  setMessages(o: { initialMessages: InitialMsg[]; threadId?: string }): Promise<void>;
  addListener(event: 'vyomApply', cb: (d: { action: string; id: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomPersist', cb: (d: { role: string; content: string; provider?: string; attachmentKind?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomImportZip', cb: (d: { base64: string; name: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomMemoryOpen', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomSaveInstructions', cb: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomForgetFact', cb: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomThreadsOpen', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomOpenThread', cb: (d: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomRenameThread', cb: (d: { id: string; title: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomDeleteThread', cb: (d: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomNewThread', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'vyomClosed', cb: () => void): Promise<PluginListenerHandle>;
}

interface Fact { text: string; at?: string }

const VyomChat = registerPlugin<VyomChatPlugin>('VyomChat');
const JARVIS_URL = import.meta.env.VITE_JARVIS_URL as string | undefined;

export const nativeVyomAvailable = () => Capacitor.getPlatform() === 'ios' && !!JARVIS_URL;

/** All messages of one thread, oldest first (same shape the native transcript expects). */
async function loadThreadMessages(uid: string, threadId: string): Promise<InitialMsg[]> {
  const msnap = await getDocs(query(collection(db, `users/${uid}/chats/${threadId}/messages`), orderBy('createdAt', 'asc')));
  return msnap.docs.map((d) => {
    const x = d.data() as { role?: string; content?: string; provider?: string; attachmentKind?: string };
    return { role: x.role === 'user' ? 'user' : 'jarvis', content: x.content ?? '', provider: x.provider, attachmentKind: x.attachmentKind };
  });
}

/** Load the most recent thread + its messages, so native continues the conversation like web. */
async function loadLastThread(uid: string): Promise<{ threadId?: string; messages: InitialMsg[] }> {
  try {
    const tsnap = await getDocs(query(collection(db, `users/${uid}/chats`), orderBy('lastMessageAt', 'desc'), fbLimit(1)));
    if (tsnap.empty) return { messages: [] };
    const threadId = tsnap.docs[0].id;
    return { threadId, messages: await loadThreadMessages(uid, threadId) };
  } catch {
    return { messages: [] };
  }
}

/** Standing instructions + remembered facts (same doc the web MemorySheet uses). */
async function loadMemory(uid: string): Promise<{ instructions: string; facts: Fact[] }> {
  const snap = await getDoc(doc(db, `users/${uid}/memory/profile`));
  const d = snap.exists() ? (snap.data() as { instructions?: string; facts?: Fact[] }) : {};
  return { instructions: d.instructions ?? '', facts: d.facts ?? [] };
}

/** Saved conversations, newest first, with a formatted subtitle for the history sheet. */
async function loadThreads(uid: string): Promise<{ id: string; title: string; subtitle: string }[]> {
  const snap = await getDocs(query(collection(db, `users/${uid}/chats`), orderBy('lastMessageAt', 'desc')));
  return snap.docs.map((doc0) => {
    const x = doc0.data() as { title?: string; lastMessageAt?: { toMillis?: () => number } };
    const ms = x.lastMessageAt?.toMillis?.();
    const subtitle = ms
      ? new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : '';
    return { id: doc0.id, title: x.title ?? '', subtitle };
  });
}

export async function openNativeVyom(opts: {
  uid: string;
  systemPromise: Promise<string>; // built lazily so the screen opens instantly (no Firestore wait)
  seed?: string;
  autoSend?: boolean;
  onApplied?: () => void;
  onClose: () => void;
}): Promise<() => void> {
  if (!nativeVyomAvailable()) return () => {};

  const uid = opts.uid;
  let threadId: string | undefined; // continue the loaded thread; new-chat clears it
  let factCache: Fact[] = []; // last-loaded facts, so forget can arrayRemove the exact object
  const handles: PluginListenerHandle[] = [];

  const pushThreads = async () => {
    await VyomChat.setThreads({ threads: await loadThreads(uid), activeId: threadId });
  };
  const pushMemory = async () => {
    const mem = await loadMemory(uid);
    factCache = mem.facts;
    await VyomChat.setMemory({ instructions: mem.instructions, facts: mem.facts.map((f) => f.text) });
  };

  handles.push(
    await VyomChat.addListener('vyomApply', async ({ action, id }) => {
      let ok = false;
      let reason = '';
      try {
        await applyAction(opts.uid, JSON.parse(action) as ProposedAction);
        ok = true;
        opts.onApplied?.();
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }
      // Surface the outcome two ways so a failure can never masquerade as success:
      // the card state (applyResult) AND a visible chat line via the proven pushMessage channel.
      try { await VyomChat.applyResult({ id, ok }); } catch { /* card may be gone */ }
      if (!ok) {
        try {
          await VyomChat.pushMessage({ role: 'jarvis', content: `Couldn't apply that — ${reason || 'please try again'}.` });
        } catch { /* ignore */ }
      }
    }),
  );

  handles.push(
    await VyomChat.addListener('vyomPersist', async ({ role, content, provider, attachmentKind }) => {
      try {
        let created = false;
        if (!threadId) {
          const ref = await addDoc(collection(db, `users/${opts.uid}/chats`), {
            title: content.slice(0, 48), createdAt: serverTimestamp(), lastMessageAt: serverTimestamp(),
          });
          threadId = ref.id;
          created = true;
        }
        await addDoc(collection(db, `users/${opts.uid}/chats/${threadId}/messages`), {
          role: role === 'user' ? 'user' : 'jarvis', content, createdAt: serverTimestamp(),
          ...(provider ? { provider } : {}),
          ...(attachmentKind ? { attachmentKind } : {}),
        });
        await setDoc(doc(db, `users/${opts.uid}/chats/${threadId}`), { lastMessageAt: serverTimestamp() }, { merge: true });
        if (created) {
          await pushThreads(); // show the new chat immediately (48-char placeholder title)
          // …then upgrade to a concise AI-generated title in the background.
          const newId = threadId;
          void aiThreadTitle(content).then(async (title) => {
            if (!title || !newId) return;
            try {
              await setDoc(doc(db, `users/${opts.uid}/chats/${newId}`), { title }, { merge: true });
              await pushThreads();
            } catch { /* keep the placeholder */ }
          });
        }
      } catch { /* best-effort */ }
    }),
  );

  handles.push(
    await VyomChat.addListener('vyomImportZip', async ({ base64, name }) => {
      // Apple Health export picked natively → run the SAME web importer, report progress + result.
      await VyomChat.pushMessage({ role: 'jarvis', content: 'Importing your Apple Health export…' });
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const file = new File([bytes], name || 'export.zip', { type: 'application/zip' });
        const r = await importHaeZip(file, opts.uid);
        const msg = `Synced from Apple Health: ${r.days} day(s) of metrics, ${r.workouts} workout(s)${r.routes ? `, ${r.routes} with routes` : ''}${r.merged ? `, enriched ${r.merged} of your manual logs with watch data` : ''}${r.skipped ? ` (skipped ${r.skipped} overlapping)` : ''}. Pull to refresh your screens.`;
        await VyomChat.pushMessage({ role: 'jarvis', content: msg });
        opts.onApplied?.();
      } catch {
        await VyomChat.pushMessage({ role: 'jarvis', content: "Couldn't read that file — make sure it's the Health Auto Export .zip." });
      }
    }),
  );

  // ── Memory sheet ──────────────────────────────────────────────────────────────
  handles.push(await VyomChat.addListener('vyomMemoryOpen', () => { void pushMemory(); }));
  handles.push(
    await VyomChat.addListener('vyomSaveInstructions', async ({ text }) => {
      try {
        await setDoc(doc(db, `users/${uid}/memory/profile`), { instructions: text, updatedAt: serverTimestamp() }, { merge: true });
      } catch { /* best-effort */ }
    }),
  );
  handles.push(
    await VyomChat.addListener('vyomForgetFact', async ({ text }) => {
      try {
        const fact = factCache.find((f) => f.text === text);
        if (fact) await updateDoc(doc(db, `users/${uid}/memory/profile`), { facts: arrayRemove(fact) });
      } catch { /* ignore */ }
      await pushMemory();
    }),
  );

  // ── Chat history sheet ────────────────────────────────────────────────────────
  handles.push(await VyomChat.addListener('vyomThreadsOpen', () => { void pushThreads(); }));
  handles.push(
    await VyomChat.addListener('vyomOpenThread', async ({ id }) => {
      threadId = id; // continue this thread; new messages append to it
      await VyomChat.setMessages({ initialMessages: await loadThreadMessages(uid, id), threadId: id });
    }),
  );
  handles.push(
    await VyomChat.addListener('vyomRenameThread', async ({ id, title }) => {
      try {
        await setDoc(doc(db, `users/${uid}/chats/${id}`), { title: title.trim() }, { merge: true });
      } catch { /* ignore */ }
      await pushThreads();
    }),
  );
  handles.push(
    await VyomChat.addListener('vyomDeleteThread', async ({ id }) => {
      try {
        const base = `users/${uid}/chats/${id}`;
        const msgs = await getDocs(collection(db, `${base}/messages`));
        const batch = writeBatch(db);
        msgs.forEach((m) => batch.delete(m.ref));
        batch.delete(doc(db, base));
        await batch.commit();
        if (threadId === id) threadId = undefined; // deleted the active thread
      } catch { /* ignore */ }
      await pushThreads();
    }),
  );

  handles.push(await VyomChat.addListener('vyomNewThread', () => { threadId = undefined; }));
  handles.push(await VyomChat.addListener('vyomClosed', () => opts.onClose()));

  // Present immediately with an empty brain (no Firestore wait) …
  await VyomChat.open({ system: '', jarvisUrl: JARVIS_URL!, seed: opts.seed, autoSend: opts.autoSend, theme: getTheme() });
  // … and mirror the app's theme toggle live into the native screen.
  const unsubTheme = subscribeTheme(() => { void VyomChat.setTheme({ theme: getTheme() }); });

  // … then stream in the personal context + prior thread as soon as the reads finish.
  void (async () => {
    const [system, thread] = await Promise.all([opts.systemPromise, loadLastThread(opts.uid)]);
    threadId = thread.threadId;
    try { await VyomChat.setContext({ system, initialMessages: thread.messages }); } catch { /* screen closed */ }
    // Eagerly load the sheets' data too (like the web's useChatThreads/useMemory on mount) and
    // push it in via the proven channel — so History/Memory show instantly, no button round-trip.
    await pushThreads().catch(() => {});
    await pushMemory().catch(() => {});
  })();

  return () => { unsubTheme(); handles.forEach((h) => h.remove()); };
}
