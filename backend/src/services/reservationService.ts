import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError, BadRequest, Forbidden, Gone, InsufficientStock, NotFound } from '../lib/errors';
import { inc } from '../lib/metrics';
import { logger } from '../lib/logger';

type LockedProduct = { id: string; stock: number; price: Prisma.Decimal };

export async function createReservation(args: {
  userId: string;
  productId: string;
  quantity: number;
}) {
  const { userId, productId, quantity } = args;
  if (quantity <= 0) throw BadRequest('Quantity must be positive');

  const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60_000);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<LockedProduct[]>(
          Prisma.sql`SELECT id, stock, price FROM "Product" WHERE id = ${productId} FOR UPDATE`,
        );
        const product = rows[0];
        if (!product) throw NotFound('Product not found');

        
        
        
        
        const existing = await tx.reservation.findFirst({
          where: { userId, productId, status: 'PENDING' },
          select: { id: true, expiresAt: true },
        });
        if (existing) {
          throw new AppError(
            409,
            'DUPLICATE_RESERVATION',
            'You already have an active reservation for this product',
            { reservationId: existing.id, expiresAt: existing.expiresAt },
          );
        }
        

        if (product.stock < quantity) {
          inc('oversell_attempts_blocked');
          throw InsufficientStock(productId);
        }

        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: quantity } },
        });

        const reservation = await tx.reservation.create({
          data: { userId, productId, quantity, expiresAt, status: 'PENDING' },
        });

        await tx.inventoryLog.create({
          data: { productId, changeAmount: -quantity, reason: 'RESERVE' },
        });

        return reservation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } finally {
    inc('reservations_created');
  }
}


export async function checkoutReservation(args: {
  userId: string;
  reservationId: string;
}) {
  const { userId, reservationId } = args;

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; userId: string; productId: string; quantity: number; status: string; expiresAt: Date }[]
      >(Prisma.sql`SELECT id, "userId", "productId", quantity, status, "expiresAt"
                   FROM "Reservation" WHERE id = ${reservationId} FOR UPDATE`);

      const r = rows[0];
      if (!r) throw NotFound('Reservation not found');
      if (r.userId !== userId) throw Forbidden('Reservation belongs to another user');
      if (r.status === 'COMPLETED') throw BadRequest('Reservation already completed');
      if (r.status === 'EXPIRED') throw Gone('Reservation expired');
      if (r.expiresAt.getTime() < Date.now()) throw Gone('Reservation expired');

      const product = await tx.product.findUniqueOrThrow({ where: { id: r.productId } });
      const totalAmount = product.price.mul(r.quantity);

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'COMPLETED' },
      });

      const order = await tx.order.create({
        data: {
          userId,
          reservationId,
          totalAmount,
        },
      });

      await tx.inventoryLog.create({
        data: { productId: r.productId, changeAmount: 0, reason: 'CHECKOUT' },
      });

      inc('reservations_completed');
      logger.info('Order created', { orderId: order.id, userId, productId: r.productId });
      return { order, reservationId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
