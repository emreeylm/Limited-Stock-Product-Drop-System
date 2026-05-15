import { z } from 'zod';

export const RegisterBody = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(100),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = RegisterBody;
export type LoginBody = z.infer<typeof LoginBody>;

export const ReserveBody = z.object({
  productId: z.string().min(1),
  quantity:  z.number().int().positive().max(10).default(1),
});
export type ReserveBody = z.infer<typeof ReserveBody>;

export const CheckoutBody = z.object({
  reservationId: z.string().min(1),
});
export type CheckoutBody = z.infer<typeof CheckoutBody>;

const positiveInt = (max: number) =>
  z.coerce.number().int().positive().max(max);

export const ProductQuery = z.object({
  // Pagination
  page:     z.coerce.number().int().positive().default(1),
  limit:    positiveInt(100).default(20),

  // Sorting
  sortBy:   z.enum(['createdAt', 'price', 'stock', 'name']).default('createdAt'),
  order:    z.enum(['asc', 'desc']).default('asc'),

  // Filtering
  minStock: z.coerce.number().int().min(0).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  search:   z.string().max(100).optional(),
});
export type ProductQuery = z.infer<typeof ProductQuery>;
