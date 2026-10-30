/**
 * Verify a Firebase ID token (RS256) inside a Cloudflare Worker using Web Crypto.
 * Checks signature against Google's public JWKS, plus iss/aud/exp/email.
 * Returns the decoded payload, or throws.
 */

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg: string;
}

let cachedKeys: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getKeys(): Promise<Jwk[]> {
  // Cache for an hour (JWKS rotates slowly).
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 3_600_000) return cachedKeys.keys;
  const res = await fetch(JWKS_URL);
  const data = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface DecodedToken {
  sub: string;
  email?: string;
  email_verified?: boolean;
  [k: string]: unknown;
}

export async function verifyFirebaseToken(token: string, projectId: string): Promise<DecodedToken> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed_token');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))) as { kid: string };
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as DecodedToken & {
    iss: string;
    aud: string;
    exp: number;
  };

  // Claim checks
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('expired');
  if (payload.aud !== projectId) throw new Error('bad_aud');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('bad_iss');

  // Signature check
  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('no_matching_key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sigB64), data);
  if (!ok) throw new Error('bad_signature');

  return payload;
}
