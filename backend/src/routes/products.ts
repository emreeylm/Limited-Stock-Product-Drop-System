import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFound } from '../lib/errors';
import { validate } from '../middleware/validate';
import { ProductQuery } from '../schemas';

const router = Router();

const SELECT = {
  id: true, name: true, description: true,
  price: true, stock: true, initialStock: true, imageUrl: true, updatedAt: true, createdAt: true,
} satisfies Prisma.ProductSelect;

router.get('/', validate(ProductQuery, 'query'), async (req, res, next) => {
  try {
    const { page, limit, sortBy, order, minStock, minPrice, maxPrice, search } =
      req.query as unknown as import('../schemas').ProductQuery;

    // Build where clause
    const where: Prisma.ProductWhereInput = {};
    if (minStock !== undefined) where.stock    = { gte: minStock };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(minPrice !== undefined ? { gte: new Prisma.Decimal(minPrice) } : {}),
        ...(maxPrice !== undefined ? { lte: new Prisma.Decimal(maxPrice) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { name:        { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select:  SELECT,
        orderBy: { [sortBy]: order },
        skip,
        take:    limit,
      }),
    ]);

    res.json({
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where:  { id: req.params.id },
      select: SELECT,
    });
    if (!product) throw NotFound('Product not found');
    res.json({ product });
  } catch (e) { next(e); }
});

export default router;
