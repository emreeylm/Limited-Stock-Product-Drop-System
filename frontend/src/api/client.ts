import type { ApiError, AuthResponse, Product, Reservation, ReservationWithProduct } from '../types';

const BASE = '/api';
const TOKEN_KEY = 'drop.token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: Record<string, unknown>) {
    const err = body['error'] as ApiError | undefined;
    super(err?.message ?? `Request failed (${status})`);
    this.status = status;
    this.code = err?.code ?? 'UNKNOWN';
    this.details = err?.details;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { auth = false, timeoutMs = 8000 } = opts;

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (auth) {
    const t = tokenStorage.get();
    if (t) headers.set('authorization', `Bearer ${t}`);
  }

  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, { ...init, headers, signal: controller.signal });
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) throw new HttpError(res.status, body);
    return body as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new HttpError(0, { error: { code: 'TIMEOUT', message: 'Request timed out' } });
    }
    throw new HttpError(0, { error: { code: 'NETWORK', message: 'Network error — check your connection' } });
  } finally {
    window.clearTimeout(id);
  }
}

export interface ProductQueryParams {
  page?:     number;
  limit?:    number;
  sortBy?:   'createdAt' | 'price' | 'stock' | 'name';
  order?:    'asc' | 'desc';
  minStock?: number;
  minPrice?: number;
  maxPrice?: number;
  search?:   string;
}

export interface Pagination {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export const api = {
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  products: (params: ProductQueryParams = {}) => {
    const qs = new URLSearchParams();
    (Object.entries(params) as [string, string | number | undefined][]).forEach(([k, v]) => {
      if (v !== undefined) qs.set(k, String(v));
    });
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ products: Product[]; pagination: Pagination }>(`/products${query}`);
  },
  product: (id: string) =>
    request<{ product: Product }>(`/products/${encodeURIComponent(id)}`),
  reserve: (productId: string, quantity: number) =>
    request<{ reservation: Reservation }>('/reserve', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }, { auth: true }),
  checkout: (reservationId: string) =>
    request<{ order: { id: string; totalAmount: string }; reservationId: string }>(
      '/checkout',
      { method: 'POST', body: JSON.stringify({ reservationId }) },
      { auth: true },
    ),
  myReservations: () =>
    request<{ reservations: ReservationWithProduct[] }>(
      '/reservations',
      {},
      { auth: true },
    ),
};
