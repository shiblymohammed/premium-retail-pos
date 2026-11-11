import { ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma, Role, ReturnDisposition } from '@prisma/client';
import { SalesService } from './sales.service';

describe('SalesService Phase 6 rules', () => {
  const actor = { userId: 'cashier-1', role: Role.CASHIER, locationIds: ['store-1'] };

  function createHarness() {
    const tx: any = {
      $queryRaw: jest.fn(),
      userLocationScope: { findMany: jest.fn().mockResolvedValue([{ locationId: 'store-1' }]) },
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'store-1', type: 'RETAIL_STORE', isActive: true, isAuditLocked: false }) },
      variant: { findMany: jest.fn() },
      idempotencyRecord: { deleteMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      invoice: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      invoicePayment: { create: jest.fn() },
      invoiceRefund: { create: jest.fn() },
      saleReturn: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      saleReturnLine: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityBaseUnits: 0, refundAmount: new Prisma.Decimal(0) } }) },
      auditEvent: { create: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)),
      idempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null) },
      invoice: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      userLocationScope: { findMany: jest.fn() },
    };
    const inventory = { recordMovement: jest.fn().mockResolvedValue({}) };
    return { tx, prisma, inventory, service: new SalesService(prisma, inventory as any) };
  }

  function cashierRow(discountLimitPercent = '10') {
    return [{ role: Role.CASHIER, isActive: true, discountLimitPercent: new Prisma.Decimal(discountLimitPercent) }];
  }

  it('quotes current prices and allocates bill discounts exactly across lines', async () => {
    const { tx, service } = createHarness();
    tx.$queryRaw.mockResolvedValueOnce(cashierRow('10')).mockResolvedValueOnce([]);
    tx.variant.findMany.mockResolvedValue([
      { id: 'v-1', sku: 'SKU-1', name: 'Default', product: { name: 'One', baseUnit: 'piece', unitsPerCarton: null, sellingPrice: new Prisma.Decimal('10.00') } },
      { id: 'v-2', sku: 'SKU-2', name: 'Default', product: { name: 'Two', baseUnit: 'piece', unitsPerCarton: null, sellingPrice: new Prisma.Decimal('20.00') } },
    ]);

    const quote = await service.quoteSale({
      lines: [
        { variantId: 'v-1', quantity: 1, enteredUnit: 'BASE_UNIT' as any },
        { variantId: 'v-2', quantity: 1, enteredUnit: 'BASE_UNIT' as any },
      ],
      billDiscountPercent: 5,
    }, actor);

    expect(quote.grossTotal.toFixed(2)).toBe('30.00');
    expect(quote.billDiscountTotal.toFixed(2)).toBe('1.50');
    expect(quote.netTotal.toFixed(2)).toBe('28.50');
    expect(quote.lines.reduce((sum, line) => sum + Number(line.billDiscount), 0)).toBeCloseTo(1.5, 2);
    expect(quote.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)).toBeCloseTo(28.5, 2);
  });

  it('rejects discounts above the assigned cap and rejects stacking', async () => {
    const { tx, service } = createHarness();
    tx.$queryRaw.mockResolvedValueOnce(cashierRow('5')).mockResolvedValueOnce([]);
    tx.variant.findMany.mockResolvedValue([
      { id: 'v-1', sku: 'SKU-1', name: 'Default', product: { name: 'One', baseUnit: 'piece', unitsPerCarton: null, sellingPrice: new Prisma.Decimal('100.00') } },
    ]);
    await expect(service.quoteSale({
      lines: [{ variantId: 'v-1', quantity: 1, enteredUnit: 'BASE_UNIT' as any, discountPercent: 6 }],
    }, actor)).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.quoteSale({
      lines: [{ variantId: 'v-1', quantity: 1, enteredUnit: 'BASE_UNIT' as any, discountPercent: 1 }],
      billDiscountPercent: 1,
    }, actor)).rejects.toThrow('Line discounts and bill discounts cannot be combined');
  });

  it('does not finalize a payment whose amount differs from current server pricing', async () => {
    const { tx, prisma, service } = createHarness();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce(cashierRow('0')).mockResolvedValueOnce([]);
    tx.variant.findMany.mockResolvedValue([
      { id: 'v-1', sku: 'SKU-1', name: 'Default', isActive: true, product: { name: 'One', baseUnit: 'piece', unitsPerCarton: null, sellingPrice: new Prisma.Decimal('10.00') } },
    ]);
    await expect(service.createSale({
      lines: [{ variantId: 'v-1', quantity: 1, enteredUnit: 'BASE_UNIT' as any }],
      paymentMethod: 'CARD' as any,
      paymentAmount: 9,
    }, actor, 'sale-key-123')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('calculates partial refunds from the saved sale-time net line amount', async () => {
    const { tx, inventory, service } = createHarness();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: actor.userId, role: Role.CASHIER, isActive: true, allowed: true },
    ]);
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1', invoiceNumber: 'INV-00000001', locationId: 'store-1', status: 'FINALIZED',
      lines: [{ id: 'sale-line-1', variantId: 'v-1', quantityBaseUnits: 10, unitPriceAtSale: new Prisma.Decimal('10.00'), lineTotal: new Prisma.Decimal('27.50'), variant: { id: 'v-1' } }],
    });
    tx.saleReturn.create.mockImplementation(async ({ data }: any) => ({
      id: 'return-1', returnNumber: data.returnNumber, invoiceId: data.invoiceId, lines: data.lines.create,
    }));
    tx.invoiceRefund.create.mockImplementation(async ({ data }: any) => ({ id: 'refund-1', ...data }));

    const result = await service.createSaleReturn('invoice-1', {
      reason: 'Customer returned five pieces',
      refundMethod: 'CASH' as any,
      lines: [{ saleLineId: 'sale-line-1', quantityBaseUnits: 5, disposition: ReturnDisposition.QUARANTINED, inspectionNotes: 'Package opened; quarantine' }],
    }, actor, 'return-key-123');

    expect(result.refund.amount.toFixed(2)).toBe('13.75');
    expect(result.lines[0].grossAmount.toFixed(2)).toBe('50.00');
    expect(result.lines[0].discountAmount.toFixed(2)).toBe('36.25');
    expect(inventory.recordMovement).toHaveBeenCalledWith(tx, expect.objectContaining({
      type: 'RETURN_INWARD', stockState: 'QUARANTINED', quantityBaseUnits: 5,
    }));
  });

  it('blocks cancellation when the current user lacks the assigned permission', async () => {
    const { tx, inventory, service } = createHarness();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: actor.userId, role: Role.CASHIER, isActive: true, allowed: false },
    ]);
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1', locationId: 'store-1', status: 'FINALIZED', payment: { id: 'payment-1' }, lines: [], returns: [],
    });
    await expect(service.cancelSale('invoice-1', {
      reason: 'Incorrect sale', refundMethod: 'CASH' as any, goodsReturnedToStore: true,
    }, actor, 'cancel-key-123')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.invoiceRefund.create).not.toHaveBeenCalled();
    expect(inventory.recordMovement).not.toHaveBeenCalled();
  });
});
