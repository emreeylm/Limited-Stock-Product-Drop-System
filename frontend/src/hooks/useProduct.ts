import { useEffect, useRef, useState } from 'react';
import { api, HttpError } from '../api/client';
import type { Product } from '../types';

export type ProductState =
  | { status: 'loading'; product: null }
  | { status: 'ready';   product: Product; lastUpdated: number }
  | { status: 'error';   product: Product | null; error: string };

/**
 * Polls /api/products/:id every `intervalMs` so the drop detail page has
 * a real-time stock count. Keeps last known product on transient errors.
 */
export function useProduct(id: string | null, intervalMs = 5000): ProductState {
  const [state, setState] = useState<ProductState>({ status: 'loading', product: null });
  const last = useRef<Product | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const { product } = await api.product(id);
        if (cancelled) return;
        last.current = product;
        setState({ status: 'ready', product, lastUpdated: Date.now() });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof HttpError ? err.message : 'Failed to load product';
        setState({ status: 'error', product: last.current, error: message });
      }
    };

    void tick();
    const tid = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(tid); };
  }, [id, intervalMs]);

  return state;
}
