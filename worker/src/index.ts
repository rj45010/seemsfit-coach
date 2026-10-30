import { verifyFirebaseToken } from './verifyToken';

export interface Env {
  GEMINI_API_KEY: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  FIREBASE_PROJECT_ID: string;
  GEMINI_MODEL?: string;
  CEREBRAS_MODEL?: string;
  OPENROUTER_MODEL?: string;
  ALLOWED_ORIGIN?: string;
}

interface ChatBody {
  system: string;
  message: string;
  history?: Array<{ role: 'user' | 'jarvis'; content: string }>;
  media?: Array<{ mimeType: string; data: string }>; // base64 (image / video / pdf)
  model?: string;
}

type Provider = 'cerebras' | 'openrouter' | 'gemini';

// The Capacitor iOS/Android WebView runs the app from these local origins (not the
// web.app host), so they must be allowed too or the native app's fetch fails CORS
// ("Load failed"). ALLOWED_ORIGIN still covers the deployed website.
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost']);

function corsHeaders(env: Env, reqOrigin?: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  // Echo the request's origin when it's the website or a known native origin; else
  // fall back to the configured website origin.
  const origin =
    reqOrigin && (reqOrigin === env.ALLOWED_ORIGIN || NATIVE_ORIGINS.has(reqOrigin)) ? reqOrigin : allowed;
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Expose-Headers': 'X-Jarvis-Provider',
    'Access-Control-Max-Age': '86400',
  };
}

const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Relay an upstream `data:`-SSE body as our simple {chunk}/{done} SSE — but first
 * PEEK until the upstream yields its first real content token. Reasoning models
 * (gpt-oss / GLM) stream `reasoning` (which we drop) and may finish with ZERO
 * `content`; if that happens we return null so the caller can fall through to the
 * next provider instead of showing the user an empty bubble. `extract` pulls the
 * incremental text out of one parsed event (Gemini vs OpenAI-compatible shape).
 */
async function relayWithContent(
  res: Response,
  extract: (evt: unknown) => string,
): Promise<ReadableStream | null> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const drain = (chunk: string, emit: (text: string) => void) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const json = t.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const text = extract(JSON.parse(json));
        if (text) emit(text);
      } catch {
        /* skip partial json */
      }
    }
  };

  // Peek: pull until we see content (commit to this provider) or the stream ends.
  let pending = '';
  let ended = false;
  while (!pending) {
    const { value, done } = await reader.read();
    if (done) {
      ended = true;
      break;
    }
    drain(decoder.decode(value, { stream: true }), (text) => (pending += text));
  }
  if (!pending) return null; // empty reply → caller falls back

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: pending })}\n\n`));
      if (ended) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      }
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
        return;
      }
      drain(decoder.decode(value, { stream: true }), (text) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: text })}\n\n`)),
      );
    },
  });
}

const geminiExtract = (evt: unknown): string => {
  const e = evt as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return e?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
};
const openaiExtract = (evt: unknown): string => {
  const e = evt as { choices?: Array<{ delta?: { content?: string } }> };
  return e?.choices?.[0]?.delta?.content ?? '';
};

type Attempt = { res: Response; extract: (evt: unknown) => string } | { fail: { status: number; detail: string } };

/** Fire one provider; returns its streaming response or a fail (so we can fall back). */
async function tryProvider(p: Provider, env: Env, body: ChatBody): Promise<Attempt> {
  // OpenAI-compatible chat history (jarvis → assistant).
  const messages = [
    { role: 'system', content: body.system },
    ...(body.history ?? []).map((m) => ({ role: m.role === 'jarvis' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: body.message },
  ];

  if (p === 'gemini') {
    const model = body.model || env.GEMINI_MODEL || 'gemini-2.5-flash';
    const lastParts: Array<Record<string, unknown>> = [{ text: body.message }];
    for (const m of body.media ?? []) lastParts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
    const contents = [
      ...(body.history ?? []).map((m) => ({ role: m.role === 'jarvis' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: lastParts },
    ];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: body.system }] }, contents, generationConfig: { temperature: 0.7 } }),
    };
    let res = await fetch(url, init);
    for (let i = 0; i < 2 && TRANSIENT.has(res.status); i++) {
      await sleep(600 * (i + 1));
      res = await fetch(url, init);
    }
    if (!res.ok || !res.body) return { fail: { status: res.status, detail: (await res.text().catch(() => '')).slice(0, 300) } };
    return { res, extract: geminiExtract };
  }

  // Cerebras + OpenRouter are OpenAI-compatible streaming endpoints.
  const cfg =
    p === 'cerebras'
      ? {
          url: 'https://api.cerebras.ai/v1/chat/completions',
          key: env.CEREBRAS_API_KEY!,
          model: env.CEREBRAS_MODEL || 'gpt-oss-120b',
          extra: {} as Record<string, string>,
          // gpt-oss/GLM are reasoning models: they stream `reasoning` (which we drop)
          // then `content` (the answer). Keep reasoning minimal and the budget large so
          // the answer always fits — otherwise reasoning eats the cap → empty reply.
          payload: { temperature: 0.7, max_completion_tokens: 8192, reasoning_effort: 'low' as const },
        }
      : {
          url: 'https://openrouter.ai/api/v1/chat/completions',
          key: env.OPENROUTER_API_KEY!,
          model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
          // OpenRouter likes these for attribution / routing.
          extra: { 'HTTP-Referer': env.ALLOWED_ORIGIN || '', 'X-Title': 'SeemsFit Jarvis' },
          payload: { temperature: 0.7, max_tokens: 2048 },
        };
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}`, ...cfg.extra },
    body: JSON.stringify({ model: cfg.model, messages, stream: true, ...cfg.payload }),
  };
  let res = await fetch(cfg.url, init);
  if (TRANSIENT.has(res.status)) {
    await sleep(600);
    res = await fetch(cfg.url, init);
  }
  if (!res.ok || !res.body) return { fail: { status: res.status, detail: (await res.text().catch(() => '')).slice(0, 300) } };
  return { res, extract: openaiExtract };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/chat') {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // --- Auth: any signed-in Firebase user with a verified email ---
    try {
      const authz = req.headers.get('Authorization') || '';
      const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
      if (!token) throw new Error('no_token');
      const decoded = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
      if (!decoded.email || decoded.email_verified !== true) {
        throw new Error('not_allowed');
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'unauthorized', detail: String(e) }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const body = (await req.json().catch(() => null)) as ChatBody | null;
    if (!body?.message?.trim()) {
      return new Response(JSON.stringify({ error: 'empty_message' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Route: everything → Gemini. Cerebras (gpt-oss) and OpenRouter (llama-3.3)
    // followed the "estimate & log accurately" rules worse than Gemini and were
    // a net source of bad nutrition estimates, so all requests now use Gemini.
    const order: Provider[] = ['gemini'];

    let lastFail = { status: 502, detail: '' };
    for (const p of order) {
      const attempt = await tryProvider(p, env, body);
      if ('res' in attempt) {
        // Peek for real content; an empty reply (reasoning-only) falls through.
        const stream = await relayWithContent(attempt.res, attempt.extract);
        if (stream) {
          return new Response(stream, {
            headers: {
              ...cors,
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'X-Jarvis-Provider': p, // which model actually answered
            },
          });
        }
        lastFail = { status: 502, detail: `empty_reply_from_${p}` };
        continue;
      }
      lastFail = attempt.fail;
    }

    // Every provider failed — classify so the client can show how long to wait.
    const reason = lastFail.status === 429 ? 'rate_limit' : lastFail.status === 503 ? 'overloaded' : 'upstream';
    const out = lastFail.status === 429 ? 429 : lastFail.status === 503 ? 503 : 502;
    return new Response(JSON.stringify({ error: 'ai_failed', reason, status: lastFail.status, detail: lastFail.detail }), {
      status: out,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
