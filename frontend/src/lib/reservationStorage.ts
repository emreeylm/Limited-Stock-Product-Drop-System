import type { Reservation } from '../types';

const PREFIX = 'drop.reservation:';

const key = (userId: string, productId: string) => `${PREFIX}${userId}:${productId}`;

/**
 * Per-user, per-product reservation cache.
 *
 * Backend is the source of truth — this cache only lets the UI re-hydrate
 * the active hold after a page refresh or back-navigation. Anything past
 * its `expiresAt` is silently dropped on read so a stale entry can't fake
 * a live countdown.
 */
export const reservationStorage = {
  get(userId: string, productId: string): Reservation | null {
    try {
      const raw = localStorage.getItem(key(userId, productId));
      if (!raw) return null;
      const r = JSON.parse(raw) as Reservation;
      if (!r?.expiresAt || new Date(r.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(key(userId, productId));
        return null;
      }
      return r;
    } catch {
      return null;
    }
  },

  set(userId: string, productId: string, r: Reservation) {
    try { localStorage.setItem(key(userId, productId), JSON.stringify(r)); } catch { /* quota */ }
  },

  clear(userId: string, productId: string) {
    localStorage.removeItem(key(userId, productId));
  },

  /** Drop every cached reservation — called on sign-out. */
  clearAll() {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },
};
