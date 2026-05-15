import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Unauthorized } from '../lib/errors';

export interface AuthPayload {
  sub: string;   // user id
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(Unauthorized('Missing bearer token'));
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = { sub: decoded.sub, email: decoded.email };
    next();
  } catch {
    next(Unauthorized('Invalid or expired token'));
  }
};
