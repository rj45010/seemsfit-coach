import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Send, X, Plus, Brain, SquarePen, History, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChatBubble } from '@/components/jarvis/ChatMessage';
import { ProposalCard } from '@/components/jarvis/ProposalCard';
import { MemorySheet } from '@/components/jarvis/MemorySheet';
import { ChatHistory } from '@/components/jarvis/ChatHistory';
import { greeting } from '@/lib/date';
import { useChatMessages, useChatThreads } from '@/hooks/useChat';
import { useSyncGoals } from '@/hooks/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { streamChat } from '@/lib/jarvisClient';
import { applyAction, extractProposals, salvageMealProposal, PROPOSAL_SENTINEL, type ProposedAction } from '@/lib/jarvisActions';
import { CHAT_SYSTEM } from '@/lib/jarvisPrompts';
import { getClientContext, buildSlimContext } from '@/lib/jarvisContext';
import { importHaeZip } from '@/lib/haeImport';
import { nativeVyomAvailable, openNativeVyom } from '@/lib/vyomNative';

const QUICK = [
  'Give me my weekly review',
  'How was my recovery this week?',
  'Plan today’s session',
  'Progress my plan for next week',
];

// Status phases — each reflects what Jarvis is actually doing (reads your data
// context, then reasons over it), so you know it's working in the background.
const PHRASES = [
  'Reading your data…',
  'Reviewing your week…',
  'Checking HRV & recovery…',
  'Looking at your training…',
  'Thinking it through…',
  'Putting it together…',
];

interface Msg {
  role: 'user' | 'jarvis';
  content: string;
  provider?: string;
  createdAt?: number; // ms since epoch — for timestamp display
}

/** Human-readable error with how-long-to-wait guidance. */
function errorMessage(code: string): string {
  switch (code) {
    case 'rate_limit':
      return "You've hit the free Gemini limit. Wait ~30–60s and tap send again. If it keeps failing, today's free quota is used up — it resets at midnight US-Pacific (~12:30 PM IST).";
    case 'overloaded':
      return 'Gemini is briefly overloaded (not you). Try again in a few seconds.';
    case 'not_configured':
      return "Vyom isn't configured — VITE_JARVIS_URL is missing.";
    case 'not_authenticated':
      return 'Session expired — please sign in again.';
    default:
      return `Vyom hit a problem (${code}). Give it a few seconds and retry.`;
  }
}

interface PendingMedia {
  dataUrl: string;
  base64: string;
  mimeType: string;
  kind: 'image' | 'video' | 'pdf';
  name: string;
}

export default function Chat({ seed, autoSend, onClose }: { seed?: string; autoSend?: boolean; onClose?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const syncGoals = useSyncGoals();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [freshChat, setFreshChat] = useState(false);
  const { data: threads } = useChatThreads();
  const { data: persisted } = useChatMessages(threadId);

  // Continue the most recent conversation on open (memory across app launches),
  // unless the user explicitly cleared the window for a fresh start.
  useEffect(() => {
    if (!freshChat && !threadId && threads && threads.length > 0) setThreadId(threads[0].id);
  }, [threads, threadId, freshChat]);

  // On iOS, hand the chat to the NATIVE Vyom screen (keyboard truly glued to the input). It
  // streams from the same worker; proposals + persistence are delegated back here (same
  // applyAction / Firestore), so nothing forks. Closing native closes this overlay.
  // Depend on the stable uid (NOT the user object) and tear down only on real unmount — a
  // churning user reference must never remove the bridge listeners mid-session, or the sheets
  // (and apply) would silently stop responding. The `cancelled` flag guards the async launch.
  useEffect(() => {
    if (!user || !nativeVyomAvailable()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        // Build the personal context lazily so the native screen opens instantly — it streams
        // in once the Firestore reads finish (mirrors the web, which builds context at send-time).
        const systemPromise = getClientContext(user.uid).then((ctx) => `${CHAT_SYSTEM}\n\n${ctx}`);
        const teardown = await openNativeVyom({
          uid: user.uid,
          systemPromise,
          seed,
          autoSend,
          onApplied: () => qc.invalidateQueries(),
          onClose: () => onClose?.(),
        });
        if (cancelled) teardown();
        else cleanup = teardown;
      } catch {
        // Native couldn't launch — close the overlay rather than flashing the web chat
        // (on iOS we deliberately never render the web UI; see the blank guard in render).
        if (!cancelled) onClose?.();
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the visible chat: start a fresh thread. Long-term memory, saved facts
  // and your standing instructions are untouched — only the on-screen history goes.
  function clearChat() {
    setLocal([]);
    setThreadId(undefined);
    setFreshChat(true);
    setProposals([]);
    setPendingMedia(null);
    setError(null);
    setInput('');
  }

  const [local, setLocal] = useState<Msg[]>([]);
  const [input, setInput] = useState(seed ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposedAction[]>([]);
  const [importing, setImporting] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Reopen a saved conversation from the history sheet.
  function openThread(id: string) {
    setLocal([]);
    setProposals([]);
    setError(null);
    setInput('');
    setPendingMedia(null);
    setFreshChat(false);
    setThreadId(id);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);

  // Quick-log shortcuts (?ask=…&send=1) fire the seed once on open.
  useEffect(() => {
    if (autoSend && seed && seed.trim() && user && !autoSentRef.current) {
      autoSentRef.current = true;
      void send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, seed, user]);

  // Auto-grow the input with content, up to 4 lines, then scroll inside it.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const cs = getComputedStyle(ta);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const max = line * 4 + pad;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }, [input]);

  function fileToMedia(file: File): Promise<PendingMedia> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const kind = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'pdf';
        resolve({ dataUrl, base64: dataUrl.split(',')[1] ?? '', mimeType: file.type || 'application/pdf', kind, name: file.name });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
      await handleZip(file);
      return;
    }
    try {
      setPendingMedia(await fileToMedia(file));
    } catch {
      setError('couldnt_read_file');
    }
  }

  async function handleZip(file?: File) {
    if (!file || !user || importing) return;
    setError(null);
    setImporting(true);
    setLocal((prev) => [
      ...(prev.length ? prev : messages),
      { role: 'jarvis', content: 'Importing your Apple Health export…' },
    ]);
    try {
      const r = await importHaeZip(file, user.uid);
      const msg = `Synced from Apple Health: ${r.days} day(s) of metrics, ${r.workouts} workout(s)${r.routes ? `, ${r.routes} with routes` : ''}${r.merged ? `, enriched ${r.merged} of your manual logs with watch data` : ''}${r.skipped ? ` (skipped ${r.skipped} overlapping)` : ''}. Pull to refresh your screens.`;
      setLocal((prev) => prev.map((m, i) => (i === prev.length - 1 ? { role: 'jarvis', content: msg } : m)));
      for (const k of ['metrics', 'metrics-today', 'workouts', 'workouts-inf', 'workouts-period', 'jarvis-context']) {
        qc.invalidateQueries({ queryKey: [k, user.uid] });
      }
    } catch {
      setLocal((prev) => prev.map((m, i) => (i === prev.length - 1 ? { role: 'jarvis', content: "Couldn't read that file — make sure it's the Health Auto Export .zip." } : m)));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleApply(a: ProposedAction) {
    if (!user) return;
    await applyAction(user.uid, a);
    for (const key of ['plans', 'programs', 'goals', 'workouts', 'workouts-inf', 'workouts-period', 'workouts-recent', 'oneRepMax', 'journal', 'metrics', 'metrics-today', 'labs', 'meals', 'mealPlans', 'insight-today', 'jarvis-context']) {
      qc.invalidateQueries({ queryKey: [key, user.uid] });
    }
    void syncGoals(); // a logged run/lift/weight or new goal may change goal progress
  }

  const messages: Msg[] =
    local.length > 0 ? local : (persisted ?? []).map((m) => {
      const ts = m.createdAt;
      const ms = ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function'
        ? (ts as { toMillis: () => number }).toMillis()
        : ts instanceof Date ? ts.getTime() : typeof ts === 'number' ? ts : undefined;
      return { role: m.role, content: m.content, provider: m.provider, createdAt: ms };
    });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    if (busy || !user) return;
    const media = pendingMedia ? [{ mimeType: pendingMedia.mimeType, data: pendingMedia.base64 }] : [];
    let message = text.trim();
    if (!message) {
      if (!media.length) return;
      message =
        pendingMedia!.kind === 'pdf'
          ? 'Read this report and save the markers to my labs.'
          : 'Check my form here.';
    }
    setError(null);
    setInput('');
    setBusy(true);
    setProposals([]);
    setPendingMedia(null);

    // Cycle a meaningful status so it's clear Jarvis is working.
    let stopped = false;
    let phaseI = 0;
    setThinking(PHRASES[0]);
    const ticker = window.setInterval(() => setThinking(PHRASES[++phaseI % PHRASES.length]), 1500);
    const stopThinking = () => {
      if (!stopped) {
        stopped = true;
        window.clearInterval(ticker);
        setThinking(null);
      }
    };

    const prior = messages
      .map((m) => m.role === 'jarvis' ? { ...m, content: m.content.split(PROPOSAL_SENTINEL)[0].trim() } : m)
      .filter((m) => m.content)
      .slice(-10);
    const now = Date.now();
    const base: Msg[] = [...messages, { role: 'user', content: message, createdAt: now }, { role: 'jarvis', content: '', createdAt: now }];
    setLocal(base);
    const jarvisIdx = base.length - 1;

    try {
      // Ensure a thread, persist the user message.
      let tid = threadId;
      if (!tid) {
        const ref = await addDoc(collection(db, `users/${user.uid}/chats`), {
          title: message.slice(0, 48),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        });
        tid = ref.id;
        setThreadId(tid);
      }
      await addDoc(collection(db, `users/${user.uid}/chats/${tid}/messages`), {
        role: 'user',
        content: message,
        createdAt: serverTimestamp(),
      });

      // General/definitional questions don't need his full data — use slim context
      // (one read, far fewer tokens) so they don't burn free-tier quota. The `my/mine`
      // guard keeps anything personal ("how's my recovery") on the full-data path.
      const isGeneral =
        /^\s*(what (is|are|s)\b|what's\b|whats\b|explain\b|define\b|how (do|does|to)\b|why (is|are|do|does)\b|tell me about\b|difference between\b|benefits? of\b|pros and cons\b|is it (better|bad|good|safe|ok|okay|worth)\b|meaning of\b)/i.test(message) &&
        !/\bmy\b|\bmine\b/i.test(message) &&
        media.length === 0;
      const context = isGeneral ? await buildSlimContext(user.uid) : await getClientContext(user.uid);
      const system = `${CHAT_SYSTEM}\n\n${context}`;

      let full = '';
      let provider: string | undefined;
      let streamErr: string | null = null;
      // Auto-retry once if the reply comes back completely empty (e.g. every provider
      // returned reasoning-only / failed) — so he never has to type "Continue" to recover.
      for (let attempt = 0; attempt < 2; attempt++) {
        full = '';
        streamErr = null;
        if (attempt > 0) setThinking(PHRASES[0]); // show it's working again on retry
        await streamChat(system, message, prior, media, {
          onChunk: (chunk) => {
            stopThinking();
            full += chunk;
            setLocal((prev) => {
              const next = [...prev];
              next[jarvisIdx] = { role: 'jarvis', content: full, provider };
              return next;
            });
          },
          onProvider: (name) => {
            provider = name;
          },
          onError: (msg) => {
            streamErr = msg;
          },
        });
        if (full.trim()) break; // got a real reply
      }
      if (streamErr && !full.trim()) setError(streamErr);

      // Separate prose from proposed actions; persist the prose.
      const { reply, proposals: found } = extractProposals(full);
      // 'remember' auto-saves (no confirm) so memory is seamless; the rest are Apply cards.
      const remembers = found.filter((p) => p.kind === 'remember');
      for (const r of remembers) {
        try {
          await applyAction(user.uid, r);
        } catch {
          /* non-fatal */
        }
      }
      if (remembers.length) {
        qc.invalidateQueries({ queryKey: ['memory', user.uid] });
        qc.invalidateQueries({ queryKey: ['jarvis-context', user.uid] }); // remembered fact is part of context
      }
      const actionable = found.filter((p) => p.kind !== 'remember');

      // Guard against the model claiming success without emitting an action: if the
      // prose says it logged/saved something but no actionable proposal came back,
      // tell the user it did NOT save instead of showing a false "Logged"/"Done".
      // Only a positive, completed claim counts — not a question ("…quality (1-5)?")
      // or a negation/offer ("I haven't logged…", "want me to log…").
      // Only warn when the user actually asked us to persist something — otherwise
      // plain coaching advice ("add hip work", "created a stimulus") trips the claim
      // words and shows a bogus "didn't save" on a message that never tried to save.
      const userWantsAction =
        /\b(log|save|record|remember|set|update|change|rename|archive|delete|create|track|note)\b/i.test(
          message,
        );
      const claimsAction =
        userWantsAction &&
        /\b(logged|saved|recorded|updated|added|created|noted|done)\b/i.test(reply) &&
        !reply.includes('?') &&
        !/\b(haven'?t|hasn'?t|didn'?t|don'?t|won'?t|can'?t|cannot|if you|want me to|would you|shall i|like me to|need)\b/i.test(reply);

      // Salvage: the model often confirms a meal in prose but forgets the action
      // block. If it clearly claims a meal log with calories, rebuild the logMeal
      // action from the prose so it still shows an Apply card instead of warning.
      if (!actionable.length && !remembers.length && claimsAction && /\bmeal\b|\bkcal\b/i.test(reply)) {
        const salvaged = salvageMealProposal(reply, message);
        if (salvaged) actionable.push(salvaged);
      }
      setProposals(actionable);

      let content = reply;
      if (!content) content = actionable.length || remembers.length ? 'Done.' : "Sorry — I didn't catch that. Please send it again.";
      else if (!actionable.length && !remembers.length && claimsAction)
        content += "\n\n⚠️ I didn't actually save that — please send your message again.";

      setLocal((prev) => {
        const next = [...prev];
        next[jarvisIdx] = { role: 'jarvis', content, provider };
        return next;
      });
      await addDoc(collection(db, `users/${user.uid}/chats/${tid}/messages`), {
        role: 'jarvis',
        content,
        createdAt: serverTimestamp(),
        ...(provider ? { provider } : {}),
      });
      await setDoc(doc(db, `users/${user.uid}/chats/${tid}`), { lastMessageAt: serverTimestamp() }, { merge: true });
      qc.invalidateQueries({ queryKey: ['threads', user.uid] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      stopThinking();
      setBusy(false);
    }
  }

  // On iOS the native Vyom screen owns the entire UI (presented full-screen over this overlay).
  // Render nothing but a plain app-colored panel so the web chat never flashes underneath it
  // during the launch gap or after a close — no confusing "two chats".
  if (nativeVyomAvailable()) return <div className="bg-paper h-full w-full" />;

  return (
    <>
      {/* Ambient glow — a soft blue wash (our accent, not Gemini gold) that warms up while
          Vyom is thinking. Fixed + full-bleed so it reaches behind the status bar and both
          edges (the chat sits in a padded, centered column), giving a seamless fade. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80 transition-opacity duration-700"
        style={{
          zIndex: 0,
          opacity: busy ? 0.95 : 0.55,
          background:
            'radial-gradient(130% 90% at 50% 0%, color-mix(in srgb, var(--color-sys-blue) 24%, transparent) 0%, transparent 68%)',
        }}
      />
      <div className="relative flex h-full flex-col" style={{ zIndex: 1 }}>
      <div className="flex items-start justify-between">
        <PageHeader eyebrow="Your coach" title="Vyom" />
        <div className="mt-1 flex shrink-0 items-center gap-2.5">
          <button
            onClick={() => setHistoryOpen(true)}
            aria-label="Chat history"
            title="Your chats"
            className="nb-btn text-ink flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]"
          >
            <History size={19} strokeWidth={2.5} />
          </button>
          <button
            onClick={clearChat}
            disabled={busy || messages.length === 0}
            aria-label="New chat (keeps memory)"
            title="New chat — keeps memory"
            className="nb-btn text-ink flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] disabled:opacity-40"
          >
            <SquarePen size={19} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setMemoryOpen(true)}
            aria-label="Vyom memory"
            title="Vyom memory"
            className="nb-btn text-ink flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]"
          >
            <Brain size={20} strokeWidth={2.5} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close Vyom"
              className="nb-btn text-ink flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]"
            >
              <X size={21} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      {memoryOpen && <MemorySheet onClose={() => setMemoryOpen(false)} />}
      {historyOpen && (
        <ChatHistory
          activeId={threadId}
          onSelect={openThread}
          onNew={clearChat}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center">
            <p className="text-ink-3 text-sm font-semibold">{greeting()}.</p>
            <h2 className="display mb-5 text-3xl leading-tight">
              How can I help
              <br />
              with your training?
            </h2>
            <div className="flex flex-col gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="flex items-center justify-between rounded-2xl bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.98]"
                >
                  <span>{q}</span>
                  <ArrowUpRight size={16} strokeWidth={2.5} className="text-ink-3 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const pending = busy && i === messages.length - 1 && m.role === 'jarvis';
            const shown = m.content.split(PROPOSAL_SENTINEL)[0].trim();
            // Before the first token arrives, show a shimmering status headline (what Vyom
            // is doing) instead of an empty bubble — reads as an assistant reasoning, not a
            // chat that's stuck loading.
            if (pending && !shown) {
              return (
                <div key={i} className="flex flex-col items-start">
                  <span className="text-ink-3 mb-1 text-[10px] font-bold uppercase tracking-wide">Vyom</span>
                  <p className="vyom-shimmer text-[15px] font-semibold">{thinking ?? 'Thinking…'}</p>
                </div>
              );
            }
            return (
              <div key={i}>
                <ChatBubble role={m.role} content={shown} pending={pending} createdAt={m.createdAt} />
              </div>
            );
          })
        )}
        {proposals.map((p, i) => (
          <ProposalCard key={i} action={p} onApply={handleApply} />
        ))}
        {error && (
          <p className="text-crit text-center text-xs font-bold leading-relaxed">
            {errorMessage(error)}
          </p>
        )}
      </div>

      <div className="relative mt-2">
        {/* one input — iOS shows its native Photo Library / Take Photo / Files sheet */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,application/pdf,.pdf,.zip"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {/* pending attachment preview */}
        {pendingMedia && (
          <div className="bg-surface mb-2 flex items-center gap-2 rounded-2xl p-2" style={{ boxShadow: 'var(--shadow-1)' }}>
            {pendingMedia.kind === 'image' ? (
              <img src={pendingMedia.dataUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="text-ink-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-[9px] font-semibold uppercase">{pendingMedia.kind}</div>
            )}
            <span className="flex-1 truncate text-xs font-bold">{pendingMedia.name}</span>
            <button onClick={() => setPendingMedia(null)} aria-label="Remove" className="text-ink-3 hover:text-crit">
              <X size={16} strokeWidth={3} />
            </button>
          </div>
        )}

        <div className="bg-surface flex items-end gap-2 rounded-3xl p-2" style={{ boxShadow: 'var(--shadow-1)' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            aria-label="Attach photo, video, PDF, or Health export"
            className="text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] disabled:opacity-40"
          >
            <Plus size={16} strokeWidth={2.5} className={importing ? 'animate-spin' : ''} />
          </button>
          {/* Enter inserts a line break — tap Send to send. Auto-grows to 4 lines, then scrolls. */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder={pendingMedia ? 'Add a note (optional)…' : 'Ask Vyom…'}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm font-medium leading-5 outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || (!input.trim() && !pendingMedia)}
            className="bg-ink text-paper flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
