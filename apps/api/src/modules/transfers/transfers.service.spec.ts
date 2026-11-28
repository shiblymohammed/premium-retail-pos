import { LocationType, Role, StockState, TransferStatus } from '@prisma/client';
import { TransfersService } from './transfers.service';

describe('TransfersService approval', () => {
  it.each([Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER])(
    'requires a different approver for a transfer requested by a %s',
    async (role) => {
      const requester = { userId: 'requesting-manager', role, locationIds: ['warehouse'] };
      const transfer = {
        sourceLocationId: 'warehouse',
        requestedByUserId: requester.userId,
        status: TransferStatus.PENDING_APPROVAL,
        lines: [{ id: 'line-1', variantId: 'variant-1', requestedQtyBase: 10, unitsPerCarton: 10, cartonRequired: true }],
      };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        idempotencyRecord: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
        transfer: {
          findUnique: jest.fn().mockResolvedValue(transfer),
          update: jest.fn().mockImplementation(async ({ data }) => ({ ...transfer, ...data })),
        },
        transferLine: { update: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
        idempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new TransfersService(prisma as any, {} as any);
      const dto = { lines: [{ variantId: 'variant-1', approvedQtyBase: 10 }] };

      await expect(service.approveTransfer('transfer-1', dto, requester, 'requester-approval'))
        .rejects.toThrow('The requester cannot approve their own transfer');
      expect(tx.transferLine.update).not.toHaveBeenCalled();
      expect(tx.transfer.update).not.toHaveBeenCalled();

      const superAdmin = { userId: 'owner', role: Role.SUPER_ADMIN, locationIds: [] };
      await expect(service.approveTransfer('transfer-1', dto, superAdmin, 'owner-approval'))
        .resolves.toMatchObject({ status: TransferStatus.APPROVED, approvedByUserId: superAdmin.userId });
    },
  );
});

describe('TransfersService receipt reconciliation and idempotency', () => {
  it('finalizes a dispatched line while another line is pending and replays retries without duplicate movements', async () => {
    const firstLine = {
      id: 'line-1',
      variantId: 'variant-1',
      requestedQtyBase: 5,
      approvedQtyBase: 5,
      dispatchedQtyBase: 5,
      receivedQtyBase: 0,
      shortQtyBase: 0,
      damagedQtyBase: 0,
      excessQtyBase: 0,
      discrepancyNotes: null,
      unitsPerCarton: null,
    };
    const secondLine = {
      id: 'line-2',
      variantId: 'variant-2',
      requestedQtyBase: 5,
      approvedQtyBase: 5,
      dispatchedQtyBase: 0,
      receivedQtyBase: 0,
      shortQtyBase: 0,
      damagedQtyBase: 0,
      excessQtyBase: 0,
      discrepancyNotes: null,
      unitsPerCarton: null,
    };
    const transfer = {
      id: 'transfer-1',
      sourceLocationId: 'source-1',
      destLocationId: 'destination-1',
      status: TransferStatus.PARTIALLY_DISPATCHED,
      lines: [firstLine, secondLine],
    };
    let storedIdempotencyRecord: any = null;
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'source-1', companyId: 'company-1', type: LocationType.MAIN_WAREHOUSE, parentId: null, isActive: true, isAuditLocked: false },
          { id: 'destination-1', companyId: 'company-1', type: LocationType.RETAIL_STORE, parentId: 'warehouse-1', isActive: true, isAuditLocked: false },
        ]),
      idempotencyRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => {
          storedIdempotencyRecord = { ...data, id: 'idempotency-1', createdAt: new Date() };
          return storedIdempotencyRecord;
        }),
      },
      transfer: {
        findUnique: jest.fn().mockResolvedValue(transfer),
        update: jest.fn().mockResolvedValue({ ...transfer, status: TransferStatus.PARTIALLY_DISPATCHED }),
      },
      transferLine: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          { ...firstLine, shortQtyBase: 5 },
          secondLine,
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
      idempotencyRecord: {
        findUnique: jest.fn().mockImplementation(async () => storedIdempotencyRecord),
      },
    };
    const inventory = { recordMovement: jest.fn().mockResolvedValue({}) };
    const service = new TransfersService(prisma as any, inventory as any);

    const receiptDto = {
      lines: [{
        variantId: 'variant-1',
        receivedQtyBase: 0,
        shortQtyBase: 5,
        finalizeLine: true,
        discrepancyNotes: 'Carrier confirmed one line was short',
      }],
    };
    const actor = {
      userId: 'destination-manager',
      role: Role.STORE_MANAGER,
      locationIds: ['destination-1'],
    };
    const firstReceipt = await service.receiveTransfer('transfer-1', receiptDto, actor, 'receipt-idempotency-1');
    const replayedReceipt = await service.receiveTransfer('transfer-1', receiptDto, actor, 'receipt-idempotency-1');

    expect(firstReceipt).toBeDefined();
    expect(replayedReceipt).toEqual(firstReceipt);
    expect(inventory.recordMovement).toHaveBeenCalledTimes(1);
    expect(tx.transfer.findUnique).toHaveBeenCalledTimes(1);
    await expect(service.receiveTransfer('transfer-1', receiptDto, {
      ...actor,
      userId: 'different-manager',
    }, 'receipt-idempotency-1')).rejects.toThrow('Idempotency-Key was already used for a different actor, endpoint, or request');
    expect(inventory.recordMovement).toHaveBeenCalledTimes(1);

    expect(inventory.recordMovement).toHaveBeenCalledWith(tx, expect.objectContaining({
      locationId: 'source-1',
      variantId: 'variant-1',
      stockState: StockState.IN_TRANSIT,
      quantityBaseUnits: -5,
    }));
  });
});
