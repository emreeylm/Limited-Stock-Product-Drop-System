import type { Reservation } from '../types';

const PREFIX = 'drop.reservation:';

const key = (userId: string, productId: string) => `${PREFIX}${userId}:${productId}`;

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
    try { localStorage.setItem(key(userId, productId), JSON.stringify(r)); } catch {  }
  },

  clear(userId: string, productId: string) {
    localStorage.removeItem(key(userId, productId));
  },

    clearAll() {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },
};
