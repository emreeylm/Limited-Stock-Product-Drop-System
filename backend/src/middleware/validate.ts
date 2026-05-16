import { RequestHandler, Request } from 'express';
import { ZodSchema } from 'zod';

type Where = 'body' | 'query' | 'params';


type Writable<W extends Where> = Pick<Request, W>;

export const validate =
  (schema: ZodSchema, where: Where = 'body'): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[where]);
    if (!parsed.success) return next(parsed.error);
    
    (req as Writable<typeof where>)[where] = parsed.data;
    next();
  };
