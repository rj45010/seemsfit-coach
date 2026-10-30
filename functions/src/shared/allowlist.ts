import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'firebase-functions/v2/https';
import './firestoreAdmin.js'; // ensure admin app is initialized

/**
 * Verifies a Firebase ID token from the Authorization header and enforces the
 * single-email allowlist. Returns the decoded token (with uid + email).
 * Throws on any failure — callers map to 401/403.
 */
export async function requireAllowedUser(req: Request) {
  // Comma-separated allowlist (ALLOWED_EMAILS), legacy ALLOWED_EMAIL as fallback.
  const allowed = (process.env.ALLOWED_EMAILS ?? process.env.ALLOWED_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) throw new Error('ALLOWED_EMAILS not configured');

  const authz = req.header('Authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw new Error('NO_TOKEN');

  const decoded = await getAuth().verifyIdToken(token);
  if (!decoded.email || !allowed.includes(decoded.email.toLowerCase()) || decoded.email_verified !== true) {
    throw new Error('NOT_ALLOWED');
  }
  return decoded;
}

/** Constant-time-ish shared-secret check for the Apple Health ingest webhook. */
export function checkIngestSecret(req: Request): boolean {
  const expected = process.env.INGEST_SECRET;
  if (!expected) return false;
  const got = req.header('X-Helios-Secret') ?? '';
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
