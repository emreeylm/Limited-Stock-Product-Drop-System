import { useEffect, useRef, useState } from 'react';
import { api, HttpError } from '../api/client';
import type { AuthUser, ReservationWithProduct } from '../types';

export type ReservationsState =
  | { status: 'idle';    reservations: ReservationWithProduct[] }
  | { status: 'loading'; reservations: ReservationWithProduct[] }
  | { status: 'ready';   reservations: ReservationWithProduct[]; lastUpdated: number }
  | { status: 'error';   reservations: ReservationWithProduct[]; error: string };

/**
 * Polls /api/reservations every `intervalMs` for the signed-in user's
 * active (PENDING + not expired) holds across all products.
 * No-ops when `user` is null. Cart badge + Cart page both consume this.
 */
export function useReservations(user: AuthUser | null, intervalMs = 5000): ReservationsState {
  const [state, setState] = useState<ReservationsState>(
    user ? { status: 'loading', reservations: [] } : { status: 'idle', reservations: [] },
  );
  const last = useRef<ReservationWithProduct[]>([]);

  useEffect(() => {
    if (!user) {
      last.current = [];
      setState({ status: 'idle', reservations: [] });
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const { reservations } = await api.myReservations();
        if (cancelled) return;
        last.current = reservations;
        setState({ status: 'ready', reservations, lastUpdated: Date.now() });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof HttpError ? err.message : 'Failed to load reservations';
        setState({ status: 'error', reservations: last.current, error: message });
      }
    };

    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user, intervalMs]);

  return state;
}
