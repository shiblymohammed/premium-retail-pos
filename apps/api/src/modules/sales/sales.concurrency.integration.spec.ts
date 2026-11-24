import { PrismaClient, Role, MovementType, StockState } from '@prisma/client';
import { randomUUID } from 'crypto';
import { InventoryService } from '../inventory/inventory.service';
import { SalesService } from './sales.service';

const databaseUrl = process.env.PHASE11_STRESS_DATABASE_URL;
const isolatedTestDatabase = (() => {
  if (!databaseUrl) return false;
  try {
    const parsed = new URL(databaseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
      && parsed.port === '5544'
      && parsed.pathname === '/pos_phase11_test';
  } catch {
    return false;
  }
})();

(isolatedTestDatabase ? describe : describe.skip)('SalesService PostgreSQL concurrency stress (isolated DB only)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
  const inventory = new InventoryService(prisma as any);
  const sales = new SalesService(prisma as any, inventory);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  let locationId: string;
  let cashierId: string;
  let variantId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: `Phase 11 stress ${suffix}`, invoicePrefix: `T${suffix}` } });
    const location = await prisma.location.create({ data: { companyId: company.id, name: `Stress store ${suffix}`, type: 'RETAIL_STORE' } });
    const cashier = await prisma.user.create({
      data: { email: `phase11-${suffix.toLowerCase()}@example.test`, passwordHash: 'integration-only', role: Role.CASHIER },
    });
    await prisma.userLocationScope.create({ data: { userId: cashier.id, locationId: location.id } });
    const product = await prisma.product.create({
      data: { name: `Stress product ${suffix}`, baseUnit: 'piece', sellingPrice: 1, purchasePrice: 0 },
    });
    const variant = await prisma.variant.create({
      data: { productId: product.id, isDefault: true, sku: `P11-${suffix}`, name: 'Default' },
    });
    await prisma.inventoryMovement.create({
      data: {
        variantId: variant.id, locationId: location.id, actorId: cashier.id,
        type: MovementType.OPENING_STOCK, stockState: StockState.AVAILABLE,
        quantityBaseUnits: 5, notes: 'Disposable Phase 11 stress fixture',
      },
    });
    locationId = location.id;
    cashierId = cashier.id;
    variantId = variant.id;
  });

  afterAll(async () => prisma.$disconnect());

  it('commits only the sales covered by stock when checkouts race', async () => {
    const saleCount = 24;
    const actor = { userId: cashierId, role: Role.CASHIER, locationIds: [locationId] };
    const results = await Promise.allSettled(Array.from({ length: saleCount }, (_, index) => sales.createSale({
      lines: [{ variantId, quantity: 1, enteredUnit: 'BASE_UNIT' as any }],
      paymentMethod: 'CARD' as any,
      paymentAmount: 1,
    }, actor, `phase11-${suffix}-${index}`)));

    const invoices = await prisma.invoice.findMany({ where: { locationId }, select: { invoiceNumber: true, idempotencyKey: true } });
    const saleMovements = await prisma.inventoryMovement.aggregate({
      where: { locationId, variantId, type: MovementType.SALE, stockState: StockState.AVAILABLE },
      _count: { _all: true },
      _sum: { quantityBaseUnits: true },
    });
    const stockBalance = await prisma.inventoryMovement.aggregate({
      where: { locationId, variantId, stockState: StockState.AVAILABLE },
      _sum: { quantityBaseUnits: true },
    });

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(saleCount - 5);
    expect(invoices).toHaveLength(5);
    expect(new Set(invoices.map((invoice) => invoice.invoiceNumber)).size).toBe(5);
    expect(new Set(invoices.map((invoice) => invoice.idempotencyKey)).size).toBe(5);
    expect(saleMovements._count._all).toBe(5);
    expect(saleMovements._sum.quantityBaseUnits).toBe(-5);
    expect(stockBalance._sum.quantityBaseUnits).toBe(0);
  });
});
