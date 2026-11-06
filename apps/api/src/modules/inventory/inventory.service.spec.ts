import { InternalServerErrorException } from '@nestjs/common';
import { MovementType, StockState } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService ledger balances', () => {
  const row = {
    variantId: 'variant-id',
    sku: 'SKU-1',
    variantName: 'Default',
    productId: 'product-id',
    productName: 'Tea',
    baseUnit: 'packet',
    unitsPerCarton: 10,
    locationId: 'location-id',
    locationName: 'Store',
    stockState: StockState.AVAILABLE,
  };

  it('returns balances from aggregated ledger rows, including negative quantities', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([
      { ...row, quantityBaseUnits: -27n },
      { ...row, stockState: StockState.IN_TRANSIT, quantityBaseUnits: 0n },
    ]) };
    const service = new InventoryService(prisma as any);

    const balances = await service.getBalances({ locationId: 'location-id' });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(balances).toEqual([
      {
        ...row,
        quantityBaseUnits: -27,
        formattedQuantity: '-27 packets = -2 cartons + -7 packets',
        negativeAvailable: true,
        warning: 'WARNING: Available stock is below zero. Confirm the physical stock before proceeding.',
      },
      {
        ...row,
        stockState: StockState.IN_TRANSIT,
        quantityBaseUnits: 0,
        formattedQuantity: '0 packets = 0 packets',
      },
    ]);
  });

  it('rejects ledger totals outside the safe integer range', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ ...row, quantityBaseUnits: BigInt(Number.MAX_SAFE_INTEGER) + 1n }]) };
    const service = new InventoryService(prisma as any);

    await expect(service.getBalances({ locationId: 'location-id' }))
      .rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('serializes a stock movement on the location row and returns the negative-stock warning', async () => {
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'location-id', isActive: true, isAuditLocked: false }])
        .mockResolvedValueOnce([{ id: 'variant-id' }])
        .mockResolvedValueOnce([{ quantityBaseUnits: 1n }]),
      variant: { findFirst: jest.fn().mockResolvedValue({ product: { baseUnit: 'packet', unitsPerCarton: 10 } }) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({ id: 'movement-id' }) },
    };
    const service = new InventoryService({} as any);

    const result = await service.recordMovement(tx as any, {
      locationId: 'location-id',
      variantId: 'variant-id',
      actorId: 'user-id',
      type: MovementType.SALE,
      stockState: StockState.AVAILABLE,
      quantityBaseUnits: -3,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(String(tx.$queryRaw.mock.calls[0][0].sql)).toContain('FOR UPDATE');
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantityBaseUnits: -3, type: MovementType.SALE }),
    });
    expect(result).toEqual(expect.objectContaining({
      balanceBaseUnits: -2,
      formattedBalance: '-2 packets = -2 packets',
      negativeAvailable: true,
      type: MovementType.SALE,
      actorId: 'user-id',
      warning: expect.stringContaining('WARNING:'),
    }));
  });

  it('converts full cartons and loose packets and links confirmed receipts to their receiver', async () => {
    const variant = {
      id: 'variant-id',
      product: { baseUnit: 'packet', unitsPerCarton: 10 },
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'location-id', isActive: true, isAuditLocked: false }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'location-id', isActive: true, isAuditLocked: false }])
        .mockResolvedValueOnce([{ id: 'variant-id' }])
        .mockResolvedValueOnce([{ quantityBaseUnits: 0n }]),
      variant: {
        findMany: jest.fn().mockResolvedValue([variant]),
        findFirst: jest.fn().mockResolvedValue(variant),
      },
      supplierReceipt: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'receipt-id',
          ...data,
          lines: [{ variantId: 'variant-id', cartons: 2, looseBaseUnits: 3, quantityBaseUnits: 23 }],
        })),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({ id: 'movement-id' }) },
    };
    const prisma = {
      supplierReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new InventoryService(prisma as any);

    const receipt = await service.receiveSupplierStock({
      locationId: 'location-id',
      receiptNumber: 'SUP-100',
      supplierName: 'Supplier Ltd',
      lines: [{ variantId: 'variant-id', cartons: 2, looseBaseUnits: 3 }],
    }, { userId: 'receiver-id' }, 'idempotency-100');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.supplierReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        receivedByUserId: 'receiver-id',
        lines: { create: [expect.objectContaining({ quantityBaseUnits: 23, unitsPerCarton: 10 })] },
      }),
    }));
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'receiver-id',
        type: MovementType.SUPPLIER_RECEIPT,
        quantityBaseUnits: 23,
        referenceType: 'supplier_receipt',
        referenceId: 'receipt-id',
      }),
    });
    expect(receipt.replayed).toBe(false);
  });
});
