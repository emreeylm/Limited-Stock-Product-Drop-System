import type { AuthUser } from '../types';

/**
 * Best-effort decode of a JWT payload without verifying the signature.
 * Verification happens server-side on every authenticated request — the
 * client only needs the payload to render "you are signed in as X".
 * Returns null on any parse failure.
 */
export function decodeJwt(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    const payloadB64 = parts[1];
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as { sub?: unknown; email?: unknown; exp?: unknown };
    if (typeof p.sub !== 'string' || typeof p.email !== 'string') return null;
    if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) return null;
    return { id: p.sub, email: p.email };
  } catch {
    return null;
  }
}
