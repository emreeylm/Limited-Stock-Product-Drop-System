import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';



vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    reservation: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    inventoryLog: { create: vi.fn() },
    order: { create: vi.fn() },
  },
}));

vi.mock('../lib/metrics', () => ({ inc: vi.fn() }));

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../config/env', () => ({
  env: { RESERVATION_TTL_MINUTES: 5 },
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
import { createReservation, checkoutReservation } from '../services/reservationService';



const PRODUCT_ID  = 'prod-1';
const USER_ID     = 'user-1';
const RESERVATION_ID = 'res-1';

function buildMockTx(overrides: {
  product?: { id: string; stock: number; price: { mul: (n: number) => unknown } } | null;
  existingReservation?: { id: string; expiresAt: Date } | null;
  reservation?: Record<string, unknown>;
} = {}) {
  const product = overrides.product !== undefined
    ? overrides.product
    : { id: PRODUCT_ID, stock: 10, price: { mul: (n: number) => n * 99 } };

  return {
    $queryRaw: vi.fn().mockResolvedValue(product ? [product] : []),
    reservation: {
      findFirst:        vi.fn().mockResolvedValue(overrides.existingReservation ?? null),
      create:           vi.fn().mockResolvedValue({
        id: RESERVATION_ID, userId: USER_ID, productId: PRODUCT_ID,
        quantity: 1, status: 'PENDING',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        createdAt: new Date(), updatedAt: new Date(),
        ...(overrides.reservation ?? {}),
      }),
      update:           vi.fn().mockResolvedValue({}),
    },
    product:  { update: vi.fn().mockResolvedValue({}) },
    inventoryLog: { create: vi.fn().mockResolvedValue({}) },
    order:    { create: vi.fn().mockResolvedValue({ id: 'order-1', totalAmount: 99 }) },
  };
}

function setupTransaction(tx: ReturnType<typeof buildMockTx>) {
  (prisma.$transaction as unknown as MockInstance).mockImplementation(
    async (fn: (t: typeof tx) => unknown) => fn(tx),
  );
}



describe('createReservation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and returns a reservation on the happy path', async () => {
    const tx = buildMockTx();
    setupTransaction(tx);

    const result = await createReservation({ userId: USER_ID, productId: PRODUCT_ID, quantity: 1 });

    expect(result.id).toBe(RESERVATION_ID);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 1 } } }),
    );
    expect(tx.reservation.create).toHaveBeenCalled();
    expect(tx.inventoryLog.create).toHaveBeenCalled();
  });

  it('throws BadRequest when quantity is 0', async () => {
    await expect(
      createReservation({ userId: USER_ID, productId: PRODUCT_ID, quantity: 0 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND when product does not exist', async () => {
    const tx = buildMockTx({ product: null });
    setupTransaction(tx);

    await expect(
      createReservation({ userId: USER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INSUFFICIENT_STOCK when stock < quantity', async () => {
    const tx = buildMockTx({ product: { id: PRODUCT_ID, stock: 0, price: { mul: (n: number) => n } } });
    setupTransaction(tx);

    await expect(
      createReservation({ userId: USER_ID, productId: PRODUCT_ID, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('throws DUPLICATE_RESERVATION when user already has a PENDING reservation', async () => {
    const tx = buildMockTx({
      existingReservation: { id: RESERVATION_ID, expiresAt: new Date() },
    });
    setupTransaction(tx);

    const err = await createReservation({ userId: USER_ID, productId: PRODUCT_ID, quantity: 1 })
      .catch((e) => e);

    expect(err).toMatchObject({ code: 'DUPLICATE_RESERVATION' });
    
    expect(err.details?.reservationId).toBe(RESERVATION_ID);
    
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});



describe('checkoutReservation', () => {
  const futureExpiry = new Date(Date.now() + 60_000);

  function buildCheckoutTx(overrides: {
    row?: Partial<{
      id: string; userId: string; productId: string;
      quantity: number; status: string; expiresAt: Date;
    }> | null;
  } = {}) {
    const row = overrides.row !== undefined ? overrides.row : {
      id: RESERVATION_ID, userId: USER_ID, productId: PRODUCT_ID,
      quantity: 1, status: 'PENDING', expiresAt: futureExpiry,
    };

    return {
      $queryRaw: vi.fn().mockResolvedValue(row ? [row] : []),
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          price: { mul: (n: number) => n * 99 },
        }),
      },
      reservation: { update: vi.fn().mockResolvedValue({}) },
      order:        { create: vi.fn().mockResolvedValue({ id: 'order-1' }) },
      inventoryLog: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('creates an order and marks reservation COMPLETED on happy path', async () => {
    const tx = buildCheckoutTx();
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    const result = await checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID });

    expect(result.order.id).toBe('order-1');
    expect(tx.reservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } }),
    );
  });

  it('throws NOT_FOUND when reservation does not exist', async () => {
    const tx = buildCheckoutTx({ row: null });
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    await expect(
      checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when reservation belongs to another user', async () => {
    const tx = buildCheckoutTx({ row: { id: RESERVATION_ID, userId: 'other-user', status: 'PENDING', expiresAt: futureExpiry } });
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    await expect(
      checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws BAD_REQUEST when reservation is already COMPLETED', async () => {
    const tx = buildCheckoutTx({ row: { id: RESERVATION_ID, userId: USER_ID, status: 'COMPLETED', expiresAt: futureExpiry } });
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    await expect(
      checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws GONE when reservation status is EXPIRED', async () => {
    const tx = buildCheckoutTx({ row: { id: RESERVATION_ID, userId: USER_ID, status: 'EXPIRED', expiresAt: futureExpiry } });
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    await expect(
      checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID }),
    ).rejects.toMatchObject({ code: 'GONE' });
  });

  it('throws GONE when reservation expiresAt is in the past', async () => {
    const expired = new Date(Date.now() - 1000);
    const tx = buildCheckoutTx({ row: { id: RESERVATION_ID, userId: USER_ID, status: 'PENDING', expiresAt: expired } });
    setupTransaction(tx as unknown as ReturnType<typeof buildMockTx>);

    await expect(
      checkoutReservation({ userId: USER_ID, reservationId: RESERVATION_ID }),
    ).rejects.toMatchObject({ code: 'GONE' });
  });
});
