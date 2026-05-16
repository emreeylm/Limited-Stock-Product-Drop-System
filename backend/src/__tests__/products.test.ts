import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    product: {
      count:      vi.fn(),
      findMany:   vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';
import productsRouter from '../routes/products';
import { errorHandler } from '../middleware/errorHandler';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  app.use(errorHandler);
  return app;
}

const COUNT     = prisma.product.count      as unknown as MockInstance;
const FIND_MANY = prisma.product.findMany   as unknown as MockInstance;
const FIND_ONE  = prisma.product.findUnique as unknown as MockInstance;

const stubProduct = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'p1', name: 'Foo', description: 'd', price: '10.00',
  stock: 5, initialStock: 5, updatedAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  COUNT.mockResolvedValue(0);
  FIND_MANY.mockResolvedValue([]);
});

describe('GET /api/products — pagination', () => {
  it('uses page=1 limit=20 as defaults', async () => {
    COUNT.mockResolvedValue(42);
    FIND_MANY.mockResolvedValue([stubProduct()]);

    const res = await request(buildApp()).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      total: 42, page: 1, limit: 20,
      totalPages: 3, hasNext: true, hasPrev: false,
    });
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0, take: 20,
    }));
  });

  it('respects page + limit and computes hasPrev / hasNext', async () => {
    COUNT.mockResolvedValue(50);
    const res = await request(buildApp()).get('/api/products?page=2&limit=10');

    expect(res.body.pagination).toMatchObject({
      total: 50, page: 2, limit: 10,
      totalPages: 5, hasNext: true, hasPrev: true,
    });
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10,
    }));
  });

  it('rejects limit > 100 with 400', async () => {
    const res = await request(buildApp()).get('/api/products?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative page with 400', async () => {
    const res = await request(buildApp()).get('/api/products?page=-1');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/products — sorting', () => {
  it('defaults to createdAt asc', async () => {
    await request(buildApp()).get('/api/products');
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'asc' },
    }));
  });

  it('honours sortBy=price&order=desc', async () => {
    await request(buildApp()).get('/api/products?sortBy=price&order=desc');
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { price: 'desc' },
    }));
  });

  it('rejects an unknown sortBy field', async () => {
    const res = await request(buildApp()).get('/api/products?sortBy=hax');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/products — filtering', () => {
  it('applies minStock as { stock: { gte } }', async () => {
    await request(buildApp()).get('/api/products?minStock=10');
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ stock: { gte: 10 } }),
    }));
  });

  it('applies price range filters', async () => {
    await request(buildApp()).get('/api/products?minPrice=20&maxPrice=200');
    const callArg = (FIND_MANY.mock.calls[0]?.[0] ?? {}) as { where?: { price?: unknown } };
    expect(callArg.where?.price).toBeDefined();
    
    expect(JSON.stringify(callArg.where!.price)).toContain('20');
    expect(JSON.stringify(callArg.where!.price)).toContain('200');
  });

  it('applies case-insensitive search on name + description', async () => {
    await request(buildApp()).get('/api/products?search=sneaker');
    expect(FIND_MANY).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { name:        { contains: 'sneaker', mode: 'insensitive' } },
          { description: { contains: 'sneaker', mode: 'insensitive' } },
        ],
      }),
    }));
  });

  it('rejects a search string longer than 100 chars', async () => {
    const long = 'x'.repeat(101);
    const res = await request(buildApp()).get(`/api/products?search=${long}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/products/:id', () => {
  it('returns the product on hit', async () => {
    FIND_ONE.mockResolvedValue(stubProduct({ id: 'p99' }));
    const res = await request(buildApp()).get('/api/products/p99');
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe('p99');
  });

  it('returns 404 on miss', async () => {
    FIND_ONE.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/products/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
