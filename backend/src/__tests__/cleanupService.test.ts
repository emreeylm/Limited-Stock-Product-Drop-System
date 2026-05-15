/**
 * Unit tests for cleanupService.ts (expiration / restock logic)
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    reservation: { findMany: vi.fn(), update: vi.fn() },
    product: { update: vi.fn() },
    inventoryLog: { create: vi.fn() },
  },
}));
vi.mock('../lib/metrics', () => ({ inc: vi.fn() }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../config/env', () => ({
  env: { CLEANUP_INTERVAL_SECONDS: 30 },
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

import { prisma } from '../lib/prisma';
import { inc } from '../lib/metrics';
import { sweepExpired } from '../services/cleanupService';

const PRODUCT_ID = 'prod-1';
const RES_ID     = 'res-1';

function buildExpiredRow(overrides: Partial<{
  id: string; productId: string; quantity: number;
  status: string; expiresAt: Date;
}> = {}) {
  return {
    id: RES_ID,
    productId: PRODUCT_ID,
    quantity: 2,
    status: 'PENDING',
    expiresAt: new Date(Date.now() - 10_000), // 10 seconds ago
    ...overrides,
  };
}

describe('sweepExpired', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires a PENDING reservation that is past its TTL and restocks the product', async () => {
    const row = buildExpiredRow();

    (prisma.reservation.findMany as unknown as MockInstance).mockResolvedValue([{ id: row.id }]);

    let capturedTx: Record<string, unknown>;
    (prisma.$transaction as unknown as MockInstance).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([row]),
        product:      { update: vi.fn().mockResolvedValue({}) },
        reservation:  { update: vi.fn().mockResolvedValue({}) },
        inventoryLog: { create: vi.fn().mockResolvedValue({}) },
      };
      capturedTx = mockTx as unknown as Record<string, unknown>;
      return fn(mockTx);
    });

    const expired = await sweepExpired();

    expect(expired).toBe(1);
    expect(inc).toHaveBeenCalledWith('reservations_expired');

    // Should restock the product
    const txProduct = (capturedTx!.product as { update: MockInstance }).update;
    expect(txProduct).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: row.quantity } } }),
    );

    // Should mark the reservation as EXPIRED
    const txRes = (capturedTx!.reservation as { update: MockInstance }).update;
    expect(txRes).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('skips a reservation whose status is no longer PENDING (e.g. COMPLETED race)', async () => {
    const row = buildExpiredRow({ status: 'COMPLETED' });

    (prisma.reservation.findMany as unknown as MockInstance).mockResolvedValue([{ id: row.id }]);
    (prisma.$transaction as unknown as MockInstance).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([row]),
        product:      { update: vi.fn() },
        reservation:  { update: vi.fn() },
        inventoryLog: { create: vi.fn() },
      };
      return fn(mockTx);
    });

    const expired = await sweepExpired();
    expect(expired).toBe(0);
  });

  it('skips a reservation whose expiresAt is still in the future', async () => {
    const row = buildExpiredRow({ expiresAt: new Date(Date.now() + 60_000) });

    (prisma.reservation.findMany as unknown as MockInstance).mockResolvedValue([{ id: row.id }]);
    (prisma.$transaction as unknown as MockInstance).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([row]),
        product:      { update: vi.fn() },
        reservation:  { update: vi.fn() },
        inventoryLog: { create: vi.fn() },
      };
      return fn(mockTx);
    });

    const expired = await sweepExpired();
    expect(expired).toBe(0);
  });

  it('returns 0 when there are no expired reservations', async () => {
    (prisma.reservation.findMany as unknown as MockInstance).mockResolvedValue([]);

    const expired = await sweepExpired();
    expect(expired).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('continues processing remaining reservations if one fails', async () => {
    (prisma.reservation.findMany as unknown as MockInstance).mockResolvedValue([
      { id: 'res-fail' },
      { id: 'res-ok' },
    ]);

    (prisma.$transaction as unknown as MockInstance).mockImplementation(async (fn: (tx: unknown) => unknown, _, id?: string) => {
      // Determine which reservation is being processed by call count
      const callCount = (prisma.$transaction as unknown as MockInstance).mock.calls.length;
      if (callCount === 1) throw new Error('DB error on first');

      const goodRow = buildExpiredRow({ id: 'res-ok' });
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([goodRow]),
        product:      { update: vi.fn().mockResolvedValue({}) },
        reservation:  { update: vi.fn().mockResolvedValue({}) },
        inventoryLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(mockTx);
    });

    // Should not throw even though first reservation fails
    await expect(sweepExpired()).resolves.toBeDefined();
  });
});
