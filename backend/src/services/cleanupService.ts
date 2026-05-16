import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { inc } from '../lib/metrics';

async function expireOne(reservationId: string): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; productId: string; quantity: number; status: string; expiresAt: Date }[]
      >(Prisma.sql`SELECT id, "productId", quantity, status, "expiresAt"
                   FROM "Reservation" WHERE id = ${reservationId} FOR UPDATE`);

      const r = rows[0];
      
      if (!r) return false;
      if (r.status !== 'PENDING') return false;
      if (r.expiresAt.getTime() > Date.now()) return false;

      
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id = ${r.productId} FOR UPDATE`);

      await tx.product.update({
        where: { id: r.productId },
        data: { stock: { increment: r.quantity } },
      });

      await tx.reservation.update({
        where: { id: r.id },
        data: { status: 'EXPIRED' },
      });

      await tx.inventoryLog.create({
        data: { productId: r.productId, changeAmount: r.quantity, reason: 'EXPIRE_RESTOCK' },
      });

      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function sweepExpired(): Promise<number> {
  const candidates = await prisma.reservation.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 500,
  });

  let expired = 0;
  for (const c of candidates) {
    try {
      if (await expireOne(c.id)) {
        expired++;
        inc('reservations_expired');
      }
    } catch (err) {
      logger.warn('Failed to expire reservation', { id: c.id, err: (err as Error).message });
    }
  }
  if (expired > 0) logger.info('Reservation sweep done', { expired });
  return expired;
}

let timer: NodeJS.Timeout | null = null;

export function startCleanupScheduler() {
  if (timer) return;
  const intervalMs = env.CLEANUP_INTERVAL_SECONDS * 1000;
  const tick = async () => {
    try { await sweepExpired(); }
    catch (err) { logger.error('Sweep tick failed', { err: (err as Error).message }); }
  };
  timer = setInterval(tick, intervalMs);
  
  void tick();
  logger.info('Cleanup scheduler started', { intervalMs });
}

export function stopCleanupScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
