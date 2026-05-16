import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();



const PRODUCTS = [
  {
    name: 'Limited Sneaker',
    description: 'The definitive silhouette for the modern explorer. Featuring an engineered mesh upper for maximum breathability and a vulcanised rubber sole for unparalleled grip. Each pair is meticulously crafted to ensure longevity and style. Drop 001 — strictly limited to 100 pairs worldwide. Comes with an authenticity certificate and custom packaging.',
    price: 199.99, stock: 100, initialStock: 100,
    imageUrl: '/product-image.png',
  },
];

async function main() {
  await prisma.inventoryLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.product.deleteMany();

  for (const p of PRODUCTS) {
    const created = await prisma.product.create({ data: p });
    if (created.stock > 0) {
      await prisma.inventoryLog.create({
        data: { productId: created.id, changeAmount: created.stock, reason: 'SEED' },
      });
    }
  }

  console.log(`Seeded ${PRODUCTS.length} products`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
