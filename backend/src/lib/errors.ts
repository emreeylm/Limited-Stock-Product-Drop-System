export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest    = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const Unauthorized  = (msg = 'Unauthorized')           => new AppError(401, 'UNAUTHORIZED', msg);
export const Forbidden     = (msg = 'Forbidden')              => new AppError(403, 'FORBIDDEN', msg);
export const NotFound      = (msg = 'Not found')              => new AppError(404, 'NOT_FOUND', msg);
export const Conflict      = (msg: string)                    => new AppError(409, 'CONFLICT', msg);
export const Gone          = (msg: string)                    => new AppError(410, 'GONE', msg);
export const InsufficientStock = (productId: string) =>
  new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock available', { productId });
