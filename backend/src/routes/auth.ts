import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { LoginBody, RegisterBody } from '../schemas';
import { signToken } from '../middleware/auth';
import { Conflict, Unauthorized } from '../lib/errors';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many auth attempts, slow down.' } },
});

router.post('/register', authLimiter, validate(RegisterBody), async (req, res, next) => {
  try {
    const { email, password } = req.body as RegisterBody;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw Conflict('Email already in use');

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hash } });
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (e) { next(e); }
});

router.post('/login', authLimiter, validate(LoginBody), async (req, res, next) => {
  try {
    const { email, password } = req.body as LoginBody;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw Unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw Unauthorized('Invalid credentials');

    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) { next(e); }
});

export default router;
