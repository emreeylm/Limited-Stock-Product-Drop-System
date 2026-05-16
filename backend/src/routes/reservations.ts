import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../lib/prisma';
import { CheckoutBody, ReserveBody } from '../schemas';
import { checkoutReservation, createReservation } from '../services/reservationService';

const router = Router();



const reserveLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? 'anon',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many reservation attempts.' } },
});

router.post('/reserve', requireAuth, reserveLimiter, validate(ReserveBody), async (req, res, next) => {
  try {
    const reservation = await createReservation({
      userId: req.user!.sub,
      productId: req.body.productId,
      quantity: req.body.quantity,
    });
    res.status(201).json({ reservation });
  } catch (e) { next(e); }
});

router.post('/checkout', requireAuth, validate(CheckoutBody), async (req, res, next) => {
  try {
    const result = await checkoutReservation({
      userId: req.user!.sub,
      reservationId: req.body.reservationId,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});




router.get('/reservations', requireAuth, async (req, res, next) => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        userId: req.user!.sub,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        product: {
          select: {
            id: true, name: true, description: true,
            price: true, stock: true, initialStock: true, imageUrl: true, updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ reservations });
  } catch (e) { next(e); }
});

export default router;
