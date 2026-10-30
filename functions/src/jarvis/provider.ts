/**
 * Provider-agnostic AI interface. Jarvis talks only to this — swapping Gemini
 * for Claude/GPT/etc. later means adding a new implementation and changing
 * `getProvider()`, nothing else in the app.
 */
export interface AiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string }; // base64 (e.g. a PDF)
}

export interface GenerateOpts {
  system: string;
  parts: AiPart[];
  /** Ask the model for strict JSON output. */
  json?: boolean;
  temperature?: number;
}

export interface AiProvider {
  generateText(opts: GenerateOpts): Promise<string>;
  streamText(opts: GenerateOpts): AsyncIterable<string>;
}

let cached: AiProvider | null = null;

/** Returns the configured provider. Currently Gemini; swap here to change. */
export async function getProvider(): Promise<AiProvider> {
  if (cached) return cached;
  const { GeminiProvider } = await import('./gemini.js');
  cached = new GeminiProvider();
  return cached;
}
