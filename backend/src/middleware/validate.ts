import { RequestHandler, Request } from 'express';
import { ZodSchema } from 'zod';

type Where = 'body' | 'query' | 'params';

// Narrow Request to the writable slot we're assigning into.
type Writable<W extends Where> = Pick<Request, W>;

export const validate =
  (schema: ZodSchema, where: Where = 'body'): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[where]);
    if (!parsed.success) return next(parsed.error);
    // Overwrite with parsed value so downstream handlers get coerced types + defaults.
    (req as Writable<typeof where>)[where] = parsed.data;
    next();
  };
