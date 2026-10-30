import { auth } from './firebase';

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL as string | undefined;

export interface StreamHandlers {
  onChunk: (text: string) => void;
  onProvider?: (name: string) => void; // which model answered (X-Jarvis-Provider)
  onDone?: () => void;
  onError?: (msg: string) => void;
}

export interface ChatTurn {
  role: 'user' | 'jarvis';
  content: string;
}

export interface MediaPart {
  mimeType: string;
  data: string; // base64 (no data: prefix)
}

/**
 * Streams a Jarvis reply from the Cloudflare Worker (which holds the Gemini key).
 * Sends the Firebase ID token; the Worker enforces the allowlist.
 */
export async function streamChat(
  system: string,
  message: string,
  history: ChatTurn[],
  media: MediaPart[],
  handlers: StreamHandlers,
): Promise<void> {
  if (!JARVIS_URL) {
    handlers.onError?.('not_configured');
    return;
  }
  const user = auth.currentUser;
  if (!user) {
    handlers.onError?.('not_authenticated');
    return;
  }
  const token = await user.getIdToken();

  const resp = await fetch(`${JARVIS_URL.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ system, message, history, media }),
  });

  if (!resp.ok || !resp.body) {
    // Prefer the Worker's classified reason (rate_limit / overloaded) over a raw code.
    let reason = `http_${resp.status}`;
    try {
      const b = (await resp.json()) as { reason?: string };
      if (b?.reason) reason = b.reason;
    } catch {
      /* no body */
    }
    handlers.onError?.(reason);
    return;
  }

  const provider = resp.headers.get('X-Jarvis-Provider');
  if (provider) handlers.onProvider?.(provider);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!data) continue;
      try {
        const evt = JSON.parse(data) as { chunk?: string; done?: boolean; error?: string };
        if (evt.chunk) handlers.onChunk(evt.chunk);
        if (evt.error) handlers.onError?.(evt.error);
        if (evt.done) handlers.onDone?.();
      } catch {
        /* ignore partial keep-alive lines */
      }
    }
  }
}
