import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService security and price history', () => {
  it('rejects product creation by non-Super-Admins before database access', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new ProductsService(prisma as any);

    await expect(service.create({} as any, { userId: 'admin-id', role: Role.ADMIN }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects price changes by non-Super-Admins before database access', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new ProductsService(prisma as any);

    await expect(service.updatePrices('product-id', { sellingPrice: 120, reason: 'Approved update' }, {
      userId: 'admin-id',
      role: Role.ADMIN,
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('locks the product before reading prices and writes the prior value to the audit log', async () => {
    const current = {
      id: 'product-id',
      sellingPrice: new Prisma.Decimal(100),
      purchasePrice: new Prisma.Decimal(50),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: current.id }]),
      product: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current, sellingPrice: new Prisma.Decimal(120) }),
      },
      priceChangeLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new ProductsService(prisma as any);

    await service.updatePrices('product-id', { sellingPrice: 120, reason: 'Approved update' }, {
      userId: 'super-admin-id',
      role: Role.SUPER_ADMIN,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.product.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.priceChangeLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        changedByUserId: 'super-admin-id',
        fieldChanged: 'selling_price',
        oldValue: current.sellingPrice,
        newValue: new Prisma.Decimal(120),
        reason: 'Approved update',
      })],
    });
  });
});
