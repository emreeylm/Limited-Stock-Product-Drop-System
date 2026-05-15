import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { snapshot, startedAt } from '../lib/metrics';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    // Cheap health probe: SELECT 1 + counts.
    const [, productCount, pendingReservations] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.product.count(),
      prisma.reservation.count({ where: { status: 'PENDING' } }),
    ]);

    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      pid: process.pid,
      memory: process.memoryUsage(),
      db: { reachable: true, productCount, pendingReservations },
      counters: snapshot(),
    });
  } catch (e) { next(e); }
});

export default router;
