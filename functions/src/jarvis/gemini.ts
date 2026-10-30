import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type { AiProvider, GenerateOpts, AiPart } from './provider.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

function client(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

function toParts(parts: AiPart[]): Part[] {
  return parts.map((p) =>
    p.inlineData
      ? { inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } }
      : { text: p.text ?? '' },
  );
}

export class GeminiProvider implements AiProvider {
  private model(opts: GenerateOpts) {
    return client().getGenerativeModel({
      model: MODEL,
      systemInstruction: opts.system,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    });
  }

  async generateText(opts: GenerateOpts): Promise<string> {
    const result = await this.model(opts).generateContent(toParts(opts.parts));
    return result.response.text();
  }

  async *streamText(opts: GenerateOpts): AsyncIterable<string> {
    const result = await this.model(opts).generateContentStream(toParts(opts.parts));
    for await (const chunk of result.stream) {
      const t = chunk.text();
      if (t) yield t;
    }
  }
}
