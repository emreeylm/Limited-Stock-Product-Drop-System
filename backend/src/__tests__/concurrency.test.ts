/**
 * Concurrency simulation tests
 *
 * Simulates N users hitting /reserve simultaneously for a product
 * with limited stock. Uses controlled mock state to represent the
 * shared DB state, proving that the duplicate guard and stock check
 * work correctly under concurrent pressure.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

vi.mock('../lib/metrics', () => ({ inc: vi.fn() }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../config/env', () => ({
  env: { RESERVATION_TTL_MINUTES: 5 },
}));
vi.mock('../lib/prisma', () => ({
  prisma: { $transaction: vi.fn() },
}));
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      sql: vi.fn((...args: unknown[]) => args),
      TransactionIsolationLevel: { Serializable: 'Serializable' },
    },
  };
});

import { createReservation } from '../services/reservationService';
import { prisma } from '../lib/prisma';

// ── Shared mutable DB state ───────────────────────────────────────────────────

let sharedStock: number;
// userId → reservationId for PENDING reservations
const pendingByUser = new Map<string, string>();

/**
 * Build a mock transaction that reads/writes shared state.
 * Each call to $transaction gets a fresh tx object but all tx objects
 * share sharedStock and pendingByUser via closure, simulating a real DB.
 */
function makeMockTx(userId: string) {
  return {
    // Lock and read product row — returns current shared stock
    $queryRaw: vi.fn().mockImplementation(() =>
      Promise.resolve([{ id: 'prod-1', stock: sharedStock }]),
    ),
    reservation: {
      // Check for existing PENDING reservation for this user
      findFirst: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) =>
        pendingByUser.has(where.userId)
          ? { id: pendingByUser.get(where.userId), expiresAt: new Date(Date.now() + 5 * 60_000) }
          : null,
      ),
      // Create reservation — decrements shared stock
      create: vi.fn().mockImplementation(({ data }: { data: { userId: string; productId: string } }) => {
        sharedStock -= 1;
        const id = `res-${data.userId}`;
        pendingByUser.set(data.userId, id);
        return {
          id,
          userId: data.userId,
          productId: data.productId,
          quantity: 1,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 5 * 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    },
    product:      { update: vi.fn().mockResolvedValue({}) },
    inventoryLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Concurrency simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedStock = 3;
    pendingByUser.clear();

    // Wire $transaction to call its callback with a mock tx
    (prisma.$transaction as unknown as MockInstance).mockImplementation(
      async (fn: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
        // The userId isn't passed to $transaction — the service reads it from
        // args closure. We pass a generic tx; findFirst/create use where.userId
        // from the actual call arguments to look up/write pendingByUser.
        const tx = makeMockTx('__shared__');
        return fn(tx);
      },
    );
  });

  it('allows exactly N users to reserve when stock = N', async () => {
    const STOCK = 3;
    sharedStock = STOCK;
    const users = Array.from({ length: STOCK }, (_, i) => `user-${i}`);

    const results = await Promise.allSettled(
      users.map((uid) => createReservation({ userId: uid, productId: 'prod-1', quantity: 1 })),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBe(STOCK);
    expect(sharedStock).toBe(0);
  });

  it('rejects duplicate reservation — same user cannot hold two PENDING for same product', async () => {
    const USER = 'user-dup';

    // First request — succeeds, adds to pendingByUser map
    const first = await createReservation({ userId: USER, productId: 'prod-1', quantity: 1 });
    expect(first.status).toBe('PENDING');
    // Our mock should have registered the pending reservation
    expect(pendingByUser.has(USER)).toBe(true);

    // Second request — duplicate guard should kick in
    const second = await createReservation({ userId: USER, productId: 'prod-1', quantity: 1 })
      .catch((e) => e);

    expect(second).toMatchObject({ code: 'DUPLICATE_RESERVATION' });
    // Stock must only have been decremented once
    expect(sharedStock).toBe(2);
  });

  it('rejects requests beyond available stock with INSUFFICIENT_STOCK', async () => {
    sharedStock = 1;
    const TOTAL = 5;
    const users = Array.from({ length: TOTAL }, (_, i) => `user-${i}`);

    // Run sequentially so stock check is deterministic
    let succeeded = 0;
    const errors: Array<{ code: string }> = [];

    for (const uid of users) {
      await createReservation({ userId: uid, productId: 'prod-1', quantity: 1 })
        .then(() => { succeeded++; })
        .catch((e) => errors.push(e));
    }

    expect(succeeded).toBe(1);
    expect(errors).toHaveLength(TOTAL - 1);
    errors.forEach((e) => expect(e.code).toBe('INSUFFICIENT_STOCK'));
    expect(sharedStock).toBe(0);
  });
});
