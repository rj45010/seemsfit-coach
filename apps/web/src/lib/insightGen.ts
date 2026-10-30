import { streamChat } from './jarvisClient';
import { buildClientContext } from './jarvisContext';
import { INSIGHT_SYSTEM } from './jarvisPrompts';

export interface GeneratedInsight {
  headline: string;
  body: string;
  recommendations: string[];
}

/** Robustly pull a JSON insight out of the model text (handles fences/preamble). */
function parseInsight(text: string): GeneratedInsight | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as Partial<GeneratedInsight>;
    if (typeof o.headline === 'string' && typeof o.body === 'string') {
      return {
        headline: o.headline,
        body: o.body,
        recommendations: Array.isArray(o.recommendations) ? o.recommendations.map(String) : [],
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** Generate the daily insight via the Worker; returns the insight + a hash of its inputs. */
export async function generateInsight(
  uid: string,
): Promise<{ insight: GeneratedInsight; inputsHash: string } | null> {
  const context = await buildClientContext(uid);
  const inputsHash = await sha1(context);

  let full = '';
  await streamChat(INSIGHT_SYSTEM, context, [], [], {
    onChunk: (c) => {
      full += c;
    },
    onError: () => {},
  });

  const insight = parseInsight(full);
  return insight ? { insight, inputsHash } : null;
}
