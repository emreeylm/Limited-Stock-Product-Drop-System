/**
 * Tests for the frontend API client — HttpError class and error handling paths.
 * fetch is mocked via vi.stubGlobal so no real network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, tokenStorage } from '../api/client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, { delay = 0 } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return {
      ok:     status >= 200 && status < 300,
      status,
      json:   async () => body,
    };
  }));
}

// ── HttpError ─────────────────────────────────────────────────────────────────

describe('HttpError', () => {
  it('exposes status, code, and message from the API error body', () => {
    const err = new HttpError(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock' } });
    expect(err.status).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.message).toBe('Not enough stock');
    expect(err).toBeInstanceOf(Error);
  });

  it('falls back gracefully when error body is empty', () => {
    const err = new HttpError(500, {});
    expect(err.status).toBe(500);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toContain('500');
  });

  it('exposes details when present', () => {
    const err = new HttpError(409, {
      error: { code: 'DUPLICATE_RESERVATION', message: 'Already reserved', details: { reservationId: 'abc' } },
    });
    expect(err.details).toEqual({ reservationId: 'abc' });
  });
});

// ── tokenStorage ──────────────────────────────────────────────────────────────

describe('tokenStorage', () => {
  afterEach(() => tokenStorage.clear());

  it('stores and retrieves a token', () => {
    tokenStorage.set('my-token');
    expect(tokenStorage.get()).toBe('my-token');
  });

  it('returns null after clear', () => {
    tokenStorage.set('my-token');
    tokenStorage.clear();
    expect(tokenStorage.get()).toBeNull();
  });
});

// ── api.products() ────────────────────────────────────────────────────────────

describe('api.products()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns product list and pagination on success', async () => {
    const payload = {
      products: [{ id: '1', name: 'Sneaker', price: '199', stock: 10 }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false },
    };
    mockFetch(200, payload);

    const { api } = await import('../api/client');
    const result = await api.products();

    expect(result.products).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it('throws HttpError on a 4xx response', async () => {
    mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Product not found' } });

    const { api } = await import('../api/client');
    await expect(api.products()).rejects.toBeInstanceOf(HttpError);
  });

  it('throws NETWORK HttpError when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const { api } = await import('../api/client');
    const err = await api.products().catch((e) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.code).toBe('NETWORK');
  });

  it('throws TIMEOUT HttpError when request exceeds timeoutMs', async () => {
    // Delay longer than the default 8s timeout — we fake timers to skip the wait
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, { signal }: { signal: AbortSignal }) => {
      // Wait until the signal is aborted
      await new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }));

    const { api } = await import('../api/client');
    const request = api.products();

    // Advance past the 8s timeout
    vi.advanceTimersByTime(9000);

    const err = await request.catch((e) => e);
    vi.useRealTimers();

    expect(err).toBeInstanceOf(HttpError);
    expect(err.code).toBe('TIMEOUT');
  });

  it('appends query params to the URL', async () => {
    const payload = { products: [], pagination: { total: 0, page: 1, limit: 5, totalPages: 0, hasNext: false, hasPrev: false } };
    mockFetch(200, payload);

    const { api } = await import('../api/client');
    await api.products({ page: 2, limit: 5, sortBy: 'price', order: 'desc', minStock: 1 });

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('sortBy=price');
    expect(calledUrl).toContain('order=desc');
    expect(calledUrl).toContain('minStock=1');
  });
});
